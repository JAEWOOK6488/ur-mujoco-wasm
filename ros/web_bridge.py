#!/usr/bin/python3
"""Loopback-only ROS trajectory action bridge to the browser MuJoCo runtime."""
import asyncio, json, math, os, threading, time, uuid
from pathlib import Path
from aiohttp import web
import rclpy
from rclpy.node import Node
from rclpy.action import ActionServer, GoalResponse, CancelResponse
from rclpy.callback_groups import ReentrantCallbackGroup
from rclpy.executors import MultiThreadedExecutor
from sensor_msgs.msg import JointState
from control_msgs.action import FollowJointTrajectory as FJT

JOINTS=['shoulder_pan_joint','shoulder_lift_joint','elbow_joint','wrist_1_joint','wrist_2_joint','wrist_3_joint']
class Bridge(Node):
    def __init__(self, loop):
        super().__init__('mujoco_web_bridge');self.loop=loop;self.ws=None;self.state=None;self.updated=0;self.busy=set();self.lock=threading.Lock()
        self.pub=self.create_publisher(JointState,'/joint_states',10)
        self.servers=[ActionServer(self,FJT,f'/{side}_arm_controller/follow_joint_trajectory',execute_callback=lambda g,s=side:self.execute(g,s),goal_callback=lambda g,s=side:self.accept(g,s),cancel_callback=lambda g:CancelResponse.ACCEPT,callback_group=ReentrantCallbackGroup()) for side in ['left','right']]
    def accept(self,g,side):
        expected=[side+'_'+j for j in JOINTS]
        valid=g.trajectory.joint_names==expected and bool(g.trajectory.points) and not g.path_tolerance and not g.multi_dof_trajectory.points and not g.component_path_tolerance and not g.component_goal_tolerance
        valid=valid and g.trajectory.header.stamp.sec==0 and g.trajectory.header.stamp.nanosec==0
        prev=-1
        for p in g.trajectory.points:
            t=p.time_from_start.sec+p.time_from_start.nanosec/1e9
            valid=valid and len(p.positions)==6 and all(math.isfinite(v) and abs(v)<=(math.pi if i==2 else 2*math.pi) for i,v in enumerate(p.positions)) and t>prev and not p.velocities and not p.accelerations and not p.effort
            prev=t
        valid=valid and all(t.name in expected and t.velocity==0 and t.acceleration==0 and t.position>=-1 for t in g.goal_tolerance)
        with self.lock:
            if not valid or side in self.busy or self.ws is None or time.monotonic()-self.updated>2:return GoalResponse.REJECT
            self.busy.add(side)
        return GoalResponse.ACCEPT
    def send(self,msg):
        ws=self.ws
        if ws is not None:asyncio.run_coroutine_threadsafe(ws.send_json(msg),self.loop)
    def execute(self,goal,side):
        gid=uuid.uuid4().hex;idx=0 if side=='left' else 1;req=goal.request
        pts=[{'t':p.time_from_start.sec+p.time_from_start.nanosec/1e9,'q':list(p.positions)} for p in req.trajectory.points]
        result=FJT.Result();result.error_code=FJT.Result.GOAL_TOLERANCE_VIOLATED
        tol={t.name:t.position for t in req.goal_tolerance};deadline=time.monotonic()+max(60,pts[-1]['t']*5+10)
        settle=req.goal_time_tolerance.sec+req.goal_time_tolerance.nanosec/1e9 or 5
        self.send({'type':'trajectory','id':gid,'arm':idx,'points':pts})
        try:
            while time.monotonic()<deadline:
                if goal.is_cancel_requested:
                    self.send({'type':'cancel','id':gid,'arm':idx});goal.canceled();result.error_string='Canceled; browser holds position';return result
                if self.ws is None or time.monotonic()-self.updated>2:
                    result.error_string='Browser disconnected or state stream stopped';break
                state=self.state;active=state.get('goals',[None,None])[idx] if state else None
                if active and active['id']==gid:
                    elapsed=active['elapsed'];actual=state['arms'][idx]['position'];desired=list(map(float,active['desired']))
                    fb=FJT.Feedback();fb.joint_names=req.trajectory.joint_names;fb.header.stamp=self.get_clock().now().to_msg();fb.actual.positions=actual;fb.desired.positions=desired;fb.error.positions=[d-a for d,a in zip(desired,actual)];goal.publish_feedback(fb)
                    errors=[abs(a-b) for a,b in zip(actual,pts[-1]['q'])]
                    if elapsed>=pts[-1]['t'] and all(tol.get(n,.08)==-1 or e<(tol.get(n,0) or .08) for n,e in zip(req.trajectory.joint_names,errors)):
                        goal.succeed();result.error_code=0;result.error_string='Web MuJoCo joints reached target';return result
                    if elapsed>pts[-1]['t']+settle:result.error_string='Web joints did not reach tolerance';break
                time.sleep(.05)
            else:result.error_string='Timed out waiting for browser simulation'
            self.send({'type':'cancel','id':gid,'arm':idx});goal.abort();return result
        finally:
            with self.lock:self.busy.discard(side)
    async def websocket(self,request):
        if request.headers.get('Origin') not in ['http://127.0.0.1:8765','http://localhost:8765']:raise web.HTTPForbidden()
        if self.ws is not None:raise web.HTTPConflict(text='Only one simulation tab may control this bridge')
        ws=web.WebSocketResponse(max_msg_size=65536,heartbeat=10);await ws.prepare(request);self.ws=ws
        try:
            async for msg in ws:
                if msg.type!=web.WSMsgType.TEXT:continue
                try:
                    state=json.loads(msg.data)
                    if state.get('type')!='state' or len(state['arms'])!=2:continue
                    for arm in state['arms']:
                        for key in ['position','velocity','torque']:
                            if len(arm[key])!=6 or not all(isinstance(v,(int,float)) and math.isfinite(v) for v in arm[key]):raise ValueError('invalid state')
                            arm[key]=list(map(float,arm[key]))
                    self.state=state;self.updated=time.monotonic()
                    m=JointState();m.header.stamp=self.get_clock().now().to_msg()
                    m.name=[s+'_'+j for s in ['left','right'] for j in JOINTS]
                    m.position=sum([a['position'] for a in state['arms']],[]);m.velocity=sum([a['velocity'] for a in state['arms']],[]);m.effort=sum([a['torque'] for a in state['arms']],[]);self.pub.publish(m)
                except (ValueError,KeyError,TypeError):await ws.close(code=1003);break
        finally:self.ws=None;self.state=None
        return ws

async def main():
    rclpy.init();loop=asyncio.get_running_loop();node=Bridge(loop);executor=MultiThreadedExecutor(num_threads=4);executor.add_node(node)
    thread=threading.Thread(target=executor.spin,daemon=True);thread.start()
    app=web.Application();app.router.add_get('/ros',node.websocket)
    root=Path(__file__).resolve().parents[1]/'public'
    async def index(request):return web.FileResponse(root/'index.html',headers={'Cache-Control':'no-store'})
    app.router.add_get('/',index);app.router.add_static('/',root)
    runner=web.AppRunner(app);await runner.setup();await web.TCPSite(runner,'127.0.0.1',8765).start()
    print('ROS 2 web bridge ready: http://127.0.0.1:8765/?ros=1',flush=True)
    try:await asyncio.Event().wait()
    finally:await runner.cleanup();executor.shutdown(timeout_sec=2);node.destroy_node();rclpy.shutdown()
if __name__=='__main__':
    try:asyncio.run(main())
    except KeyboardInterrupt:pass

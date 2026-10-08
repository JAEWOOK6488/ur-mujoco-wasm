#!/usr/bin/python3
import time
import rclpy
from rclpy.action import ActionClient
from sensor_msgs.msg import JointState
from control_msgs.action import FollowJointTrajectory as FJT
from trajectory_msgs.msg import JointTrajectoryPoint
rclpy.init();node=rclpy.create_node('web_bridge_check');state={}
sub=node.create_subscription(JointState,'/joint_states',lambda m:state.update(zip(m.name,m.position)),10)
def wait(test,seconds=30):
    deadline=time.monotonic()+seconds
    while time.monotonic()<deadline:
        rclpy.spin_once(node,timeout_sec=.1)
        if test():return
    raise AssertionError('Timed out')
wait(lambda:len(state)==12)
names=['shoulder_pan_joint','shoulder_lift_joint','elbow_joint','wrist_1_joint','wrist_2_joint','wrist_3_joint']
for side,target in [('left',-1.4),('right',-1.7)]:
    c=ActionClient(node,FJT,f'/{side}_arm_controller/follow_joint_trajectory');assert c.wait_for_server(timeout_sec=5)
    other='right' if side=='left' else 'left';before=state[other+'_shoulder_pan_joint']
    g=FJT.Goal();g.trajectory.joint_names=[side+'_'+n for n in names];p=JointTrajectoryPoint();p.positions=[target,-1.57,1.57,-1.57,-1.57,0.0];p.time_from_start.sec=3;g.trajectory.points=[p]
    f=c.send_goal_async(g);wait(f.done);assert f.result().accepted,'Goal rejected'
    result=f.result().get_result_async();wait(result.done);assert result.result().result.error_code==0,result.result().result.error_string
    wait(lambda:abs(state[side+'_shoulder_pan_joint']-target)<.003)
    assert abs(state[other+'_shoulder_pan_joint']-before)<.01
    print(side,'PASS',state[side+'_shoulder_pan_joint'],result.result().result.error_string,flush=True)
    c.destroy()
node.destroy_node();rclpy.shutdown()

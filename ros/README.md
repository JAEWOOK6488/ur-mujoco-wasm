# ROS 2 → browser MuJoCo → RViz

On this configured PC, run `bash ~/ur_ws/start-bimanual-sim.sh`, then open http://127.0.0.1:8765/?ros=1 in one browser tab. The GitHub Pages URL remains standalone. Keep the browser tab active: background throttling slows simulation.

The launch starts robot_state_publisher, the loopback bridge and RViz. It intentionally does NOT start mock hardware or controller_manager. The bridge is an action server at `/left_arm_controller/follow_joint_trajectory` and `/right_arm_controller/follow_joint_trajectory`. The web interpolates position trajectories in simulation time and applies its existing rate-limited MuJoCo position servos. Measured position, velocity and motor torque return at up to 20 Hz on `/joint_states`; RViz uses this measured stream.

Only six ordered prefixed joint names and finite position waypoints within joint limits are accepted. Time stamps must be immediate, waypoint times strictly increase. Explicit velocity, acceleration, effort, path tolerances and multi-DOF trajectories are rejected, not silently ignored. Position goal tolerances are supported; default is 0.08 rad, default extra settling time 5 simulation seconds. Cancellation holds current joint positions. Browser disconnect aborts a goal, and disconnected requests are rejected. Only one browser connection and one goal per arm are allowed. The server binds only 127.0.0.1 and checks same-origin WebSocket requests.

ROS mode disables local pose/demo controls to prevent conflicting command sources. It does not connect to physical hardware. RViz grippers remain fixed visual models; the ROS actions control the 12 arm joints. URDF/Menagerie TCP conventions differ; joint motion is synchronized, not calibrated TCP geometry.

Dependencies: ROS 2 Humble, rclpy, control_msgs, sensor_msgs, python3-aiohttp, ur_description, robot_state_publisher, rviz2, xacro. The configured PC already has these. For another workspace copy `ros/ur_bimanual_demo` to its `src`, build it with colcon, run `npm ci && npm run build` in this repository, then `bash ros/start.sh`. Set UR_WORKSPACE if not ~/ur_ws.

Live verification (moves simulated arms): source ~/ur_ws/install/setup.bash; /usr/bin/python3 ros/check_live.py. This sends a goal to each arm, waits for success and measured position, and checks the other settled shoulder stays still.

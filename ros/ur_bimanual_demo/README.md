# Dual UR5e mock-hardware workcell

Run `bash ~/ur_ws/start-bimanual-sim.sh`. The previous `start-ur5e-sim.sh` now opens this dual-arm setup too. `start-single-ur5e-sim.sh` preserves the single-arm launcher.

Both arms share the `world` frame and `/joint_states` (12 joints). Each has unique `left_` / `right_` joint and link names, a separate GenericSystem hardware instance, and an independent controller managed by one controller manager.

Trajectory actions:
- `/left_arm_controller/follow_joint_trajectory`
- `/right_arm_controller/follow_joint_trajectory`

The base positions are (-0.48, 0.35, 0.40) and (0.48, 0.35, 0.40) metres; yaw angles are 0.30 and -0.83 radians. They face the shared table. UR description frames differ from the web Menagerie model, so this is not a calibrated identity between their TCPs.

This uses ROS 2 mock hardware, not MuJoCo dynamics or a real-robot driver connection. Grippers are fixed open visual models. There is no contact physics, motor-current model, collision avoidance, or web bridge here.

Verification: source `~/ur_ws/install/setup.bash`, then run `/usr/bin/python3 ~/ur_ws/verify-bimanual.py` from `~/ur_ws`. It uses isolated ROS domain 88, verifies all twelve joints and both tool transforms, sends one trajectory to each arm, and asserts the opposite arm stays stationary. It stops its own test launch afterward. Normal launches inherit your ROS_DOMAIN_ID (204 in the setup session).

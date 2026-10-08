from pathlib import Path
import xacro
from ament_index_python.packages import get_package_share_directory
from launch import LaunchDescription
from launch.actions import ExecuteProcess, DeclareLaunchArgument
from launch.conditions import IfCondition
from launch.substitutions import LaunchConfiguration
from launch_ros.actions import Node

def generate_launch_description():
    share=Path(get_package_share_directory('ur_bimanual_demo'))
    description={'robot_description':xacro.process_file(str(share/'urdf/bimanual.urdf.xacro')).toxml()}
    return LaunchDescription([
      DeclareLaunchArgument('launch_rviz',default_value='true'),
      DeclareLaunchArgument('bridge_script'),
      Node(package='robot_state_publisher',executable='robot_state_publisher',parameters=[description],output='screen'),
      ExecuteProcess(cmd=['/usr/bin/python3',LaunchConfiguration('bridge_script')],output='screen'),
      Node(package='rviz2',executable='rviz2',arguments=['-d',str(share/'config/bimanual.rviz')],condition=IfCondition(LaunchConfiguration('launch_rviz')),output='screen')])

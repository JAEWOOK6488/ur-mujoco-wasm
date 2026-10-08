#!/usr/bin/env bash
set -e
bridge_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
workspace="${UR_WORKSPACE:-$HOME/ur_ws}"
exec 9> "$workspace/.bimanual.lock"
flock -n 9 || { echo '양팔 실행이 이미 있습니다. 해당 터미널에서 Ctrl+C로 종료하세요.' >&2; exit 1; }
source /opt/ros/humble/setup.bash
source "$workspace/install/setup.bash"
exec ros2 launch ur_bimanual_demo web.launch.py "bridge_script:=$bridge_dir/web_bridge.py" "$@"

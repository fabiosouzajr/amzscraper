#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create logs directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Function to start a process in the background with nohup
start_process() {
  local name=$1
  local dir=$2
  local cmd=$3
  
  echo "Starting $name in $dir..."
  cd "$SCRIPT_DIR/$dir" || exit 1
  nohup bash -c "$cmd" > "$SCRIPT_DIR/logs/${name}.log" 2>&1 & pid=$!
  echo "$name started with PID: $pid"
  echo "$pid" > "$SCRIPT_DIR/logs/${name}.pid"
  PID_LIST+=" $pid"
}

# Start frontend
start_process "frontend" "frontend" "npm run dev"

# Start backend
start_process "backend" "backend" "npm run dev"

echo
echo "Both processes have started and will continue running after terminal closes"
echo "Frontend log: $SCRIPT_DIR/logs/frontend.log"
echo "Backend log: $SCRIPT_DIR/logs/backend.log"
echo "PID files: $SCRIPT_DIR/logs/*.pid"
echo
echo "To stop the processes, run: kill \$(cat $SCRIPT_DIR/logs/*.pid)"

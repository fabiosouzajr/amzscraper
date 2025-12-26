#!/bin/bash

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create logs directory if it doesn't exist
mkdir -p "$SCRIPT_DIR/logs"

# Prompt for backend port
read -p "Enter backend port (default: 3030): " BACKEND_PORT
BACKEND_PORT=${BACKEND_PORT:-3030}

# Prompt for frontend port
read -p "Enter frontend port (default: 5174): " FRONTEND_PORT
FRONTEND_PORT=${FRONTEND_PORT:-5174}

# Validate ports are numbers
if ! [[ "$BACKEND_PORT" =~ ^[0-9]+$ ]] || [ "$BACKEND_PORT" -lt 1 ] || [ "$BACKEND_PORT" -gt 65535 ]; then
  echo "Error: Backend port must be a number between 1 and 65535"
  exit 1
fi

if ! [[ "$FRONTEND_PORT" =~ ^[0-9]+$ ]] || [ "$FRONTEND_PORT" -lt 1 ] || [ "$FRONTEND_PORT" -gt 65535 ]; then
  echo "Error: Frontend port must be a number between 1 and 65535"
  exit 1
fi

# Warn if backend port differs from default (vite proxy might need updating)
if [ "$BACKEND_PORT" != "3000" ]; then
  echo "Warning: Backend port is set to $BACKEND_PORT (default: 3000)"
  echo "Note: If the frontend proxy doesn't work, update the proxy target in frontend/vite.config.ts"
fi

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

# Start backend with custom port
start_process "backend" "backend" "PORT=$BACKEND_PORT npm run dev"

# Start frontend with custom port
start_process "frontend" "frontend" "npm run dev -- --port $FRONTEND_PORT"

# Get Tailscale information if available
TAILSCALE_IP=$(tailscale ip -4 2>/dev/null || echo "")
TAILSCALE_HOSTNAME=$(tailscale status --json 2>/dev/null | grep -o '"DNSName":"[^"]*' | cut -d'"' -f4 | head -1 || echo "")

echo
echo "Both processes have started and will continue running after terminal closes"
echo "Backend running on port: $BACKEND_PORT"
echo "Frontend running on port: $FRONTEND_PORT"
echo "Frontend log: $SCRIPT_DIR/logs/frontend.log"
echo "Backend log: $SCRIPT_DIR/logs/backend.log"
echo "PID files: $SCRIPT_DIR/logs/*.pid"
echo
if [ -n "$TAILSCALE_IP" ]; then
  echo "=== Tailscale Access ==="
  echo "Frontend: http://$TAILSCALE_IP:$FRONTEND_PORT"
  if [ -n "$TAILSCALE_HOSTNAME" ]; then
    echo "Frontend (hostname): http://$TAILSCALE_HOSTNAME:$FRONTEND_PORT"
  fi
  echo "Backend API: http://$TAILSCALE_IP:$BACKEND_PORT"
  if [ -n "$TAILSCALE_HOSTNAME" ]; then
    echo "Backend API (hostname): http://$TAILSCALE_HOSTNAME:$BACKEND_PORT"
  fi
  echo "========================="
  echo
else
  echo "Note: Tailscale not detected. App is only accessible on localhost."
  echo "      To enable Tailscale access, ensure Tailscale is running and connected."
  echo
fi
echo "To stop the processes, run: kill \$(cat $SCRIPT_DIR/logs/*.pid)"

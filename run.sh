# Source - https://stackoverflow.com/a
# Posted by Alessandro Pezzato, modified by community. See post 'Timeline' for change history
# Retrieved 2025-12-21, License - CC BY-SA 3.0

#!/bin/bash

for cmd in "$@"; do {
  echo "Process \"$cmd\" started";
  $cmd & pid=$!
  PID_LIST+=" $pid";
} done

trap "kill $PID_LIST" SIGINT

echo "Parallel processes have started";

wait $PID_LIST

echo
echo "All processes have completed";

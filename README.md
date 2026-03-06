# smokin-aceys
Acey Deucey Betting Strategy Simulator

# claude-code setup:
## making shims
```
cat > "${HOME}/.local/bin/xdg-open-host" << 'EOF'
#!/bin/bash
echo "$1" | nc -U /tmp/browser-proxy.sock
EOF
chmod +x "${HOME}/.local/bin/xdg-open-host"
```

```
cat > "${HOME}/.local/bin/browser-server.sh" << 'EOF'
#!/bin/bash
# Listens on a Unix socket, opens URLs via Windows host
SOCKET_PATH="/tmp/browser-proxy.sock"
rm -f "$SOCKET_PATH"

while true; do
  URL=$(nc -lU "$SOCKET_PATH")
  echo "Opening: $URL"
  powershell.exe -Command "Start-Process '$URL'" 2>/dev/null || \
  cmd.exe /c start "$URL" 2>/dev/null
done
EOF
chmod +x "${HOME}/.local/bin/browser-server.sh"
```

## run separately

~/.local/bin/browser-server.sh &

## needed to run

```
mkdir -p "${HOME}/.local/bin"
mkdir -p "${HOME}/.claude/config"
mkdir -p "$(pwd)/.claude-sessions"
```

# run command:

```
podman run -it --rm --name claude-dev \
  -p 3000:3000 \
  -v "$(pwd):/home/agent/workspace:Z" \
  -v "${HOME}/.claude/config:/home/agent/.claude:Z" \
  -v "$(pwd)/.claude-sessions:/home/agent/.claude/projects:Z" \
  -v "${HOME}/.local/bin/xdg-open-host:/usr/local/bin/xdg-open:ro" \
  -v "/tmp/browser-proxy.sock:/tmp/browser-proxy.sock:Z" \
  -e BROWSER=/usr/local/bin/xdg-open \
  --userns=keep-id \
  docker.io/docker/sandbox-templates:claude-code
```

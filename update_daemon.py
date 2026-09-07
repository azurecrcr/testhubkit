#!/usr/bin/env python3
"""Script to update agent_runner_daemon.py with improved logging and timeout handling."""

# Read the backup file
with open('deploy/mcp-agent/agent_runner_daemon.py.bak', 'r') as f:
    content = f.read()

# Add import for time at the top
old_imports = '''import json
import os
import re
import signal
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path'''

new_imports = '''import json
import os
import re
import signal
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path'''

content = content.replace(old_imports, new_imports)

# Add environment variable configuration after imports
old_agent_bin = '''AGENT_BIN = os.environ.get("AGENT_BIN", "/root/.local/bin/agent")'''

new_agent_bin = '''AGENT_BIN = os.environ.get("AGENT_BIN", "/root/.local/bin/agent")
AGENT_TIMEOUT_SEC = int(os.environ.get("AGENT_TIMEOUT_SEC", "300"))'''

content = content.replace(old_agent_bin, new_agent_bin)

# Add log writing function before _run_agent
old_run_agent = '''def _run_agent(job_id, job_dir, cursor_api_key=None):'''

new_run_agent = '''def _write_log(log_path, log_lines):
    """Write log lines to file."""
    try:
        log_path.write_text("\\n".join(log_lines), encoding="utf-8")
    except Exception as e:
        print(f"Failed to write log to {log_path}: {e}")

def _run_agent(job_id, job_dir, cursor_api_key=None):'''

content = content.replace(old_run_agent, new_run_agent)

# Modify the subprocess.Popen section to capture stderr separately
old_popen = '''        proc = subprocess.Popen(
            cmd, cwd=str(job_dir), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            universal_newlines=True, env=env,
        )'''

new_popen = '''        proc = subprocess.Popen(
            cmd, cwd=str(job_dir), stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            universal_newlines=True, env=env,
        )'''

content = content.replace(old_popen, new_popen)

# Replace the stdout reading section with concurrent reading
old_read = '''        if proc.stdout:
            for line in proc.stdout:
                log_lines.append(line.rstrip("\\n"))
                with _lock:
                    _jobs[job_id]["log"] = "\\n".join(log_lines)
        rc = proc.wait()'''

new_read = '''        def read_stream(stream, prefix):
            nonlocal log_lines
            try:
                for line in stream:
                    line = line.rstrip("\\n")
                    if line:
                        log_lines.append(f"[{prefix}] {line}")
                        with _lock:
                            _jobs[job_id]["log"] = "\\n".join(log_lines)
            except Exception as e:
                log_lines.append(f"Error reading {prefix}: {e}")
        
        stdout_thread = threading.Thread(target=read_stream, args=(proc.stdout, "STDOUT"), daemon=True)
        stderr_thread = threading.Thread(target=read_stream, args=(proc.stderr, "STDERR"), daemon=True)
        stdout_thread.start()
        stderr_thread.start()
        
        # Wait with timeout
        try:
            rc = proc.wait(timeout=AGENT_TIMEOUT_SEC)
        except subprocess.TimeoutExpired:
            proc.kill()
            stdout_thread.join(timeout=5)
            stderr_thread.join(timeout=5)
            log_lines.append(f"Process timeout after {AGENT_TIMEOUT_SEC}s, killed")
            rc = -9
        
        stdout_thread.join(timeout=5)
        stderr_thread.join(timeout=5)'''

content = content.replace(old_read, new_read)

# Modify exception handling to write log file
old_except = '''    except Exception as exc:
        with _lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = str(exc)
            _jobs[job_id]["log"] = "\\n".join(log_lines)'''

new_except = '''    except Exception as exc:
        log_lines.append(f"Exception in _run_agent: {exc}")
        import traceback
        log_lines.append(traceback.format_exc())
        with _lock:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = str(exc)
            _jobs[job_id]["log"] = "\\n".join(log_lines)
    
    # Write log to file
    log_path = job_dir / "agent.log"
    _write_log(log_path, log_lines)'''

content = content.replace(old_except, new_except)

# Add log writing after successful completion too
old_finished = '''        with _lock:
            _jobs[job_id]["log"] = "\\n".join(log_lines)
            _jobs[job_id]["returncode"] = rc
            _jobs[job_id]["status"] = "finished" if rc == 0 else "failed"'''

new_finished = '''        with _lock:
            _jobs[job_id]["log"] = "\\n".join(log_lines)
            _jobs[job_id]["returncode"] = rc
            _jobs[job_id]["status"] = "finished" if rc == 0 else "failed"
        
        # Write log to file
        log_path = job_dir / "agent.log"
        _write_log(log_path, log_lines)'''

content = content.replace(old_finished, new_finished)

# Write the modified file
with open('deploy/mcp-agent/agent_runner_daemon.py', 'w') as f:
    f.write(content)

print('Daemon file updated successfully')

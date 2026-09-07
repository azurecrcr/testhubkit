#!/bin/sh
set -eu

JMETER_HOME="${JMETER_HOME:-/opt/apache-jmeter-5.6.3}"
TOOLS_DIR="${JMETER_TOOLS_DIR:-/opt/jmeter-tools}"
JMX_FILE="${1:-}"

if [ -z "$JMX_FILE" ] || [ ! -f "$JMX_FILE" ]; then
  echo "VALIDATION_FAILED: missing jmx file" >&2
  exit 2
fi

if [ ! -f "$TOOLS_DIR/JmxLoadValidator.class" ]; then
  echo "VALIDATION_FAILED: JmxLoadValidator.class not found in $TOOLS_DIR" >&2
  exit 2
fi

CP="$TOOLS_DIR"
for jar in "$JMETER_HOME"/lib/*.jar "$JMETER_HOME"/lib/ext/*.jar; do
  [ -f "$jar" ] || continue
  CP="$CP:$jar"
done

exec java -cp "$CP" JmxLoadValidator "$JMX_FILE"

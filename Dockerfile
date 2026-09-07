FROM eclipse-temurin:21-jdk-jammy AS jmeter-build
ENV JMETER_VERSION=5.6.3
ENV JMETER_HOME=/opt/apache-jmeter-5.6.3
ENV JMETER_TOOLS_DIR=/opt/jmeter-tools
COPY deploy/jmeter-tools/ /opt/jmeter-tools-src/
RUN set -eux; \
    if [ -f "/opt/jmeter-tools-src/apache-jmeter-${JMETER_VERSION}.tgz" ]; then \
      cp "/opt/jmeter-tools-src/apache-jmeter-${JMETER_VERSION}.tgz" /tmp/jmeter.tgz; \
    else \
      apt-get update \
      && apt-get install -y --no-install-recommends curl ca-certificates \
      && curl -fsSL "https://archive.apache.org/dist/jmeter/binaries/apache-jmeter-${JMETER_VERSION}.tgz" -o /tmp/jmeter.tgz \
      && rm -rf /var/lib/apt/lists/*; \
    fi \
    && tar -xzf /tmp/jmeter.tgz -C /opt \
    && rm /tmp/jmeter.tgz
COPY deploy/jmeter-tools/JmxLoadValidator.java /opt/jmeter-tools/
COPY deploy/jmeter-tools/validate_jmx.sh /opt/jmeter-tools/
RUN chmod +x /opt/jmeter-tools/validate_jmx.sh \
    && CP="/opt/jmeter-tools" \
    && for j in "$JMETER_HOME"/lib/*.jar "$JMETER_HOME"/lib/ext/*.jar; do CP="$CP:$j"; done \
    && javac -cp "$CP" -d /opt/jmeter-tools /opt/jmeter-tools/JmxLoadValidator.java

FROM python:3.11-slim
WORKDIR /app

# edge-tts 回退到 pyttsx3 时需要 espeak-ng；pydub 导出 mp3 等格式需要 ffmpeg
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || true \
    && sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list 2>/dev/null || true \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        espeak-ng \
        ffmpeg \
        bash \
    && rm -rf /var/lib/apt/lists/*

COPY --from=jmeter-build /opt/java/openjdk /opt/java/openjdk
COPY --from=jmeter-build /opt/apache-jmeter-5.6.3 /opt/apache-jmeter-5.6.3
COPY --from=jmeter-build /opt/jmeter-tools /opt/jmeter-tools

ENV JAVA_HOME=/opt/java/openjdk
ENV JMETER_HOME=/opt/apache-jmeter-5.6.3
ENV JMETER_TOOLS_DIR=/opt/jmeter-tools
ENV PATH="${JAVA_HOME}/bin:${JMETER_HOME}/bin:${PATH}"

COPY requirements.txt .
RUN pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ && pip install gunicorn -i https://mirrors.aliyun.com/pypi/simple/
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "300", "app:app"]

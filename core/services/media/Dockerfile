FROM python:3.11-slim
WORKDIR /app

# edge-tts 回退到 pyttsx3 时需要 espeak-ng；pydub 导出 mp3 等格式需要 ffmpeg
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        espeak-ng \
        ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ && pip install gunicorn -i https://mirrors.aliyun.com/pypi/simple/
COPY . .
EXPOSE 5000
CMD ["gunicorn", "-w", "2", "-b", "0.0.0.0:5000", "--timeout", "300", "app:app"]

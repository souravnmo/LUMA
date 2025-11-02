from flask import send_file, Response
import shutil
from flask import Flask, request, jsonify, send_file
import os
import time
import logging
import traceback
import yt_dlp
import gc
import uuid
import requests
from PIL import Image
import io
import base64
import json
import threading
from dotenv import load_dotenv
from werkzeug.utils import secure_filename
import re
import shutil

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

logger.info("🚀 Running on: CPU")
logger.info("🚀 Starting AI Engine on port 5000")

# Directory for temporary files
TEMP_DIR = os.path.join(os.getcwd(), 'temp')
os.makedirs(TEMP_DIR, exist_ok=True)

# Lock for file operations to prevent race conditions
file_lock = threading.Lock()

# --- Helper Functions ---
def cleanup_file(filepath):
    try:
        if os.path.exists(filepath):
            with file_lock:
                gc.collect()
                time.sleep(1)
                os.remove(filepath)
                logger.info(f"Cleaned up: {filepath}")
    except Exception as e:
        logger.error(f"Cleanup error for {filepath}: {str(e)}")

def check_file_size(filepath):
    if not os.path.exists(filepath):
        return False, 0
    size_mb = os.path.getsize(filepath) / (1024 * 1024)
    return size_mb <= 95, size_mb

# === REPLACE ENTIRE /yt/search IN 1.py ===

from functools import lru_cache
import threading

# CLEAR CACHE ON EMPTY RESULTS
search_cache = {}

def get_yt_search(query):
    query = query.strip().lower()
    
    # RETURN CACHED IF NOT EMPTY
    if query in search_cache and search_cache[query]:
        logger.info(f"Cache HIT: {query}")
        return search_cache[query]

    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'skip_download': True,
            'cookiefile': 'cookies.txt',  # FORCE COOKIES
            'http_headers': {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept-Language': 'en-US,en;q=0.9',
                'Referer': 'https://www.youtube.com/',
            },
            'retries': 3,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(f"ytsearch10:{query}", download=False, process=False)
            entries = result.get('entries', []) if result else []

        videos = [
            {
                'title': v.get('title', 'Unknown'),
                'url': f"https://www.youtube.com/watch?v={v['id']}",
                'thumbnail': v.get('thumbnails', [{}])[0].get('url'),
                'duration': v.get('duration')
            } for v in entries if v.get('id')
        ][:5]  # Top 5

        # ONLY CACHE IF RESULTS
        if videos:
            search_cache[query] = videos
            logger.info(f"Search SUCCESS: {query} → {len(videos)} results")
        else:
            logger.warning(f"Search FAILED: {query} → No results (cookies?)")

        return videos

    except Exception as e:
        logger.error(f"Search ERROR: {str(e)}")
        return []

@app.route('/yt/search', methods=['GET'])
def yt_search():
    query = request.args.get('q')
    if not query:
        return jsonify({'error': 'missing query'}), 400

    results = get_yt_search(query)
    return jsonify({'results': results})

# --- YouTube Download Endpoint (Fixed for Duplicates and File Not Found) ---

@app.route('/yt/download', methods=['POST'])
def yt_download():
    data = request.get_json() or {}
    url = data.get('url')
    kind = data.get('type', 'audio')

    if not url:
        return jsonify({'error': 'missing url'}), 400

    unique_id = str(uuid.uuid4()).replace('-', '')
    output_template = os.path.join(TEMP_DIR, f"yt_{unique_id}")

    # === FIXED: PROPER INDENT + COLON ===
    if kind == 'audio':
        fmt = 'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio[ext=mp3]/bestaudio'
        mimes = {'m4a': 'audio/mp4', 'webm': 'audio/webm', 'mp3': 'audio/mpeg'}
    else:
        fmt = 'best[ext=mp4][height<=480]/best[height<=480][ext=mp4]/best[ext=webm][height<=480]/best'
        mimes = {'mp4': 'video/mp4', 'webm': 'video/webm'}

    ydl_opts = {
        'format': fmt,
        'outtmpl': f"{output_template}.%(ext)s",
        'quiet': True,
        'no_warnings': True,
        'http_headers': {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        'retries': 3,
        'fragment_retries': 3,
        'socket_timeout': 12,
        'download_timeout': 180,
        'cookiefile': 'cookies.txt' if os.path.exists('cookies.txt') else None,
        'noplaylist': True,
        'nooverwrites': True,
    }

    try:
        import subprocess
        cmd = ['yt-dlp', '--newline', '-f', fmt, '--output', f"{output_template}.%(ext)s", url]
        if os.path.exists('cookies.txt'):
            cmd += ['--cookies', 'cookies.txt']

        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            stdout, stderr = proc.communicate(timeout=180)
        except subprocess.TimeoutExpired:
            proc.kill()
            return jsonify({'error': 'download timeout'}), 500

        if proc.returncode != 0:
            logger.error(f"yt-dlp failed: {stderr.decode()}")
            return jsonify({'error': 'download failed'}), 500

        actual_file = None
        for f in os.listdir(TEMP_DIR):
            if f.startswith(f"yt_{unique_id}."):
                actual_file = os.path.join(TEMP_DIR, f)
                ext = f.split('.')[-1]
                break

        if not actual_file:
            return jsonify({'error': 'file not found'}), 500

        size_mb = os.path.getsize(actual_file) / (1024*1024)
        if size_mb > 95:
            cleanup_file(actual_file)
            return jsonify({'error': f'file too large ({size_mb:.1f}MB)'}), 400

        def stream():
            with open(actual_file, 'rb') as f:
                while chunk := f.read(1024*1024):
                    yield chunk

        resp = Response(stream(), mimetype=mimes.get(ext, 'application/octet-stream'))
        resp.headers['Content-Disposition'] = f'attachment; filename="yt_{unique_id}.{ext}"'

        @resp.call_on_close
        def cleanup():
            time.sleep(0.5)
            cleanup_file(actual_file)

        return resp

    except Exception as e:
        logger.error(f"YT ERROR: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500


# --- Flux.1 Image Generation Endpoint ---
@app.route('/flux', methods=['POST'])
def flux_generate():
    data = request.get_json() or {}
    prompt = data.get('prompt')
    if not prompt:
        logger.error("Missing prompt in /flux")
        return jsonify({'error': 'missing prompt'}), 400
    try:
        unique_id = str(uuid.uuid4()).replace('-', '')
        output_file = os.path.join(TEMP_DIR, f"flux_{unique_id}.png")

        api_key = os.getenv('FLUX_API_KEY')
        if not api_key:
            logger.error("Flux API key not set")
            return jsonify({'error': 'Flux API key not configured'}), 500

        api_url = "https://api.replicate.com/v1/predictions"
        response = requests.post(
            api_url,
            headers={'Authorization': f'Bearer {api_key}'},
            json={
                'version': 'flux.1-dev',
                'input': {
                    'prompt': prompt,
                    'num_outputs': 1,
                    'output_format': 'png',
                    'width': 512,
                    'height': 512
                }
            },
            timeout=60
        )
        response.raise_for_status()
        prediction = response.json()
        image_url = prediction.get('output')[0]

        with file_lock:
            image_response = requests.get(image_url, timeout=30)
            image_response.raise_for_status()
            with open(output_file, 'wb') as f:
                f.write(image_response.content)

        is_valid, file_size = check_file_size(output_file)
        logger.info(f"Flux image generated: {output_file} (size: {file_size:.2f}MB)")
        
        if not is_valid:
            logger.warning(f"Image too large: {file_size:.2f}MB")
            cleanup_file(output_file)
            return jsonify({'error': 'image too large'}), 400

        response = send_file(
            output_file,
            as_attachment=True,
            mimetype='image/png',
            download_name=f"flux_{secure_filename(prompt[:20])}.png"
        )
        return response
    except Exception as e:
        logger.error(f"Flux generation error: {str(e)} with traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500
    finally:
        cleanup_file(output_file if 'output_file' in locals() else None)

# --- General Image Generation Endpoint ---
@app.route('/genimage', methods=['POST'])
def gen_image():
    data = request.get_json() or {}
    prompt = data.get('prompt')
    if not prompt:
        logger.error("Missing prompt in /genimage")
        return jsonify({'error': 'missing prompt'}), 400
    try:
        unique_id = str(uuid.uuid4()).replace('-', '')
        output_file = os.path.join(TEMP_DIR, f"genimage_{unique_id}.png")

        api_key = os.getenv('STABLE_DIFFUSION_API_KEY')
        if not api_key:
            logger.error("Stable Diffusion API key not set")
            return jsonify({'error': 'Stable Diffusion API key not configured'}), 500

        api_url = "https://api.stability.ai/v1/generation/text-to-image"
        response = requests.post(
            api_url,
            headers={'Authorization': f'Bearer {api_key}'},
            json={
                'text_prompts': [{'text': prompt}],
                'width': 512,
                'height': 512,
                'samples': 1,
                'steps': 30
            },
            timeout=60
        )
        response.raise_for_status()
        image_data = response.json().get('artifacts')[0].get('base64')

        with file_lock:
            image_bytes = base64.b64decode(image_data)
            with open(output_file, 'wb') as f:
                f.write(image_bytes)

        is_valid, file_size = check_file_size(output_file)
        logger.info(f"Image generated: {output_file} (size: {file_size:.2f}MB)")
        
        if not is_valid:
            logger.warning(f"Image too large: {file_size:.2f}MB")
            cleanup_file(output_file)
            return jsonify({'error': 'image too large'}), 400

        response = send_file(
            output_file,
            as_attachment=True,
            mimetype='image/png',
            download_name=f"genimage_{secure_filename(prompt[:20])}.png"
        )
        return response
    except Exception as e:
        logger.error(f"Image generation error: {str(e)} with traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500
    finally:
        cleanup_file(output_file if 'output_file' in locals() else None)

# --- Text-to-Speech Endpoint ---
# --- Text-to-Speech Endpoint (gTTS - Free Alternative) ---
@app.route('/tts', methods=['POST'])
def tts():
    data = request.get_json() or {}
    text = data.get('text')
    if not text:
        logger.error("Missing text in /tts")
        return jsonify({'error': 'missing text'}), 400

    try:
        unique_id = str(uuid.uuid4()).replace('-', '')
        output_file = os.path.join(TEMP_DIR, f"tts_{unique_id}.mp3")

        # Install: pip install gtts (run in terminal)
        from gtts import gTTS
        tts = gTTS(text=text, lang='en', slow=False)  # lang='hi' for Hindi, etc.
        tts.save(output_file)

        is_valid, file_size = check_file_size(output_file)
        logger.info(f"TTS generated (gTTS): {output_file} (size: {file_size:.2f}MB)")

        if not is_valid:
            cleanup_file(output_file)
            return jsonify({'error': 'audio too large'}), 400

        resp = send_file(
            output_file,
            as_attachment=True,
            mimetype='audio/mpeg',
            download_name=f"tts_{secure_filename(text[:20])}.mp3"
        )

        @resp.call_on_close
        def _cleanup():
            time.sleep(0.5)
            cleanup_file(output_file)

        return resp

    except Exception as e:
        logger.error(f"TTS error: {str(e)}\n{traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500
    finally:
        if 'output_file' in locals():
            cleanup_file(output_file)

# --- AI Chat Endpoint ---
@app.route('/ai', methods=['POST'])
def ai():
    data = request.get_json() or {}
    prompt = data.get('prompt')
    conversation_id = data.get('conversation_id', None)
    if not prompt:
        logger.error("Missing prompt in /ai")
        return jsonify({'error': 'missing prompt'}), 400
    try:
        api_key = os.getenv('GROK_API_KEY')
        if not api_key:
            logger.error("AI API key not set")
            return jsonify({'error': 'AI API key not configured'}), 500

        api_url = "https://api.x.ai/v1/chat/completions"
        headers = {'Authorization': f'Bearer {api_key}'}
        payload = {
            'model': 'grok',
            'messages': [{'role': 'user', 'content': prompt}],
            'conversation_id': conversation_id
        }
        response = requests.post(api_url, headers=headers, json=payload, timeout=30)
        response.raise_for_status()
        result = response.json()
        response_text = result.get('choices')[0].get('message').get('content')
        new_conversation_id = result.get('conversation_id', conversation_id)

        logger.info(f"AI response generated for prompt: {prompt[:50]}...")
        return jsonify({'response': response_text, 'conversation_id': new_conversation_id})
    except Exception as e:
        logger.error(f"AI error: {str(e)} with traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

# --- Gemini-Specific Endpoint ---
@app.route('/gemini', methods=['POST'])
def gemini():
    data = request.get_json() or {}
    prompt = data.get('prompt')
    if not prompt:
        logger.error("Missing prompt in /gemini")
        return jsonify({'error': 'missing prompt'}), 400
    try:
        api_key = os.getenv('GEMINI_API_KEY')
        if not api_key:
            logger.error("Gemini API key not set")
            return jsonify({'error': 'Gemini API key not configured'}), 500

        api_url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
        response = requests.post(
            api_url,
            headers={'Authorization': f'Bearer {api_key}'},
            json={'contents': [{'parts': [{'text': prompt}]}]},
            timeout=30
        )
        response.raise_for_status()
        result = response.json()
        response_text = result.get('candidates')[0].get('content').get('parts')[0].get('text')

        logger.info(f"Gemini response generated for prompt: {prompt[:50]}...")
        return jsonify({'response': response_text})
    except Exception as e:
        logger.error(f"Gemini error: {str(e)} with traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

# --- NSFW Image Filtering Endpoint ---
@app.route('/nsfi', methods=['POST'])
def nsfi():
    if 'image' not in request.files:
        logger.error("Missing image in /nsfi")
        return jsonify({'error': 'missing image'}), 400
    image_file = request.files['image']
    try:
        unique_id = str(uuid.uuid4()).replace('-', '')
        output_file = os.path.join(TEMP_DIR, f"nsfi_{unique_id}.png")

        with file_lock:
            image_file.save(output_file)

        api_key = os.getenv('NSFW_API_KEY')
        if not api_key:
            logger.error("NSFW API key not set")
            return jsonify({'error': 'NSFW API key not configured'}), 500

        with open(output_file, 'rb') as f:
            response = requests.post(
                "https://api.example.com/nsfw/detect",
                headers={'Authorization': f'Bearer {api_key}'},
                files={'image': f},
                timeout=30
            )
            response.raise_for_status()
            result = response.json()
            is_safe = result.get('is_safe', True)

        logger.info(f"NSFI check for {output_file}: {'Safe' if is_safe else 'NSFW'}")
        return jsonify({'is_safe': is_safe})
    except Exception as e:
        logger.error(f"NSFI error: {str(e)} with traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500
    finally:
        cleanup_file(output_file if 'output_file' in locals() else None)

# --- Cleanup Old Files ---
def cleanup_temp_directory():
    """Periodically clean up old files in temp directory."""
    try:
        for filename in os.listdir(TEMP_DIR):
            filepath = os.path.join(TEMP_DIR, filename)
            if os.path.isfile(filepath) and time.time() - os.path.getmtime(filepath) > 3600:
                cleanup_file(filepath)
    except Exception as e:
        logger.error(f"Temp directory cleanup error: {str(e)}")

# Schedule periodic cleanup
from threading import Thread
def run_cleanup():
    while True:
        cleanup_temp_directory()
        time.sleep(3600)

cleanup_thread = Thread(target=run_cleanup, daemon=True)
cleanup_thread.start()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
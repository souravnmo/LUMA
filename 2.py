from flask import Flask, request, jsonify
import requests
import base64
import os
import time
import hashlib


app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'healthy', 
        'device': 'API',
        'models_loaded': {
            'image': True, 
            'cinematic': True
        }
    })

@app.route('/generate', methods=['POST'])
def generate():
    try:
        data = request.get_json()
        mode = data.get('mode', 'img')
        prompt = data.get('prompt', '')
        
        if not prompt:
            return jsonify({'error': 'No prompt provided'}), 400
        
        print(f"Request - Mode: {mode}, Prompt: {prompt}")
        
        if mode == 'img':
            # Standard image generation with unique seed
            timestamp = str(time.time())
            unique_seed = int(hashlib.md5(f"{prompt}{timestamp}".encode()).hexdigest()[:8], 16)
            
            url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(prompt)}?seed={unique_seed}&width=1024&height=1024&nologo=true&enhance=true"
            
            print(f"Generating image (seed: {unique_seed})...")
            response = requests.get(url, timeout=120)
            
            if response.status_code == 200:
                img_b64 = base64.b64encode(response.content).decode('utf-8')
                print("✅ Image generated")
                return jsonify({'image': img_b64, 'mode': 'img'})
            else:
                return jsonify({'error': 'Image generation failed'}), 500
        
        elif mode == 'cinematic':
            # Cinematic wide-format image generation
            timestamp = str(time.time())
            unique_seed = int(hashlib.md5(f"{prompt}{timestamp}".encode()).hexdigest()[:8], 16)
            
            # Enhance prompt with cinematic keywords
            cinematic_prompt = f"{prompt}, cinematic composition, dramatic lighting, epic scene, wide angle shot, 8k resolution, professional photography, motion blur, film grain, depth of field"
            
            url = f"https://image.pollinations.ai/prompt/{requests.utils.quote(cinematic_prompt)}?seed={unique_seed}&width=1920&height=1080&nologo=true&enhance=true"
            
            print(f"Generating cinematic image (seed: {unique_seed})...")
            response = requests.get(url, timeout=120)
            
            if response.status_code == 200:
                img_b64 = base64.b64encode(response.content).decode('utf-8')
                print("✅ Cinematic image generated")
                return jsonify({'image': img_b64, 'mode': 'cinematic'})
            else:
                return jsonify({'error': 'Cinematic generation failed'}), 500
        
        else:
            return jsonify({'error': f'Invalid mode: {mode}'}), 400
    
    except Exception as e:
        print(f"❌ Error: {e}")
        return jsonify({'error': str(e)}), 500
    

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))  # Changed to 5001
    print("=" * 60)
    print("AI Engine Lite - Fast Image Generation")
    print("=" * 60)
    print(f"Port: {port}")
    print("Image: Pollinations AI (Fast, Unique)")
    print("Cinematic: Enhanced wide-format images")
    print("=" * 60)
    app.run(host='0.0.0.0', port=port, debug=False)
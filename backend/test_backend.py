#!/usr/bin/env python3
"""
Test script for Lucy Virtual Try-On Backend
Run this to verify your backend setup is working correctly
"""

import sys
import asyncio
import requests
import json
import base64
from io import BytesIO
from PIL import Image
import websockets


# Configuration
API_URL = "http://localhost:5000"
WS_URL = "ws://localhost:5000/ws"


def print_test(test_name):
    """Print test header"""
    print("\n" + "="*60)
    print(f"Testing: {test_name}")
    print("="*60)


def print_success(message):
    """Print success message"""
    print(f"✓ {message}")


def print_error(message):
    """Print error message"""
    print(f"✗ {message}")


def create_test_image(size=(512, 512), color=(255, 0, 0)):
    """Create a test image and return as base64"""
    img = Image.new('RGB', size, color)
    buffer = BytesIO()
    img.save(buffer, format='JPEG')
    img_bytes = buffer.getvalue()
    img_base64 = base64.b64encode(img_bytes).decode('utf-8')
    return f"data:image/jpeg;base64,{img_base64}"


def test_health_check():
    """Test health check endpoint"""
    print_test("Health Check")
    
    try:
        response = requests.get(f"{API_URL}/health")
        
        if response.status_code == 200:
            data = response.json()
            print_success(f"Server is healthy")
            print(f"  Status: {data.get('status')}")
            print(f"  AI Model Loaded: {data.get('ai_model_loaded')}")
            print(f"  Fabric Processor Ready: {data.get('fabric_processor_ready')}")
            print(f"  Device: {data.get('device')}")
            print(f"  Active Connections: {data.get('active_connections')}")
            return True
        else:
            print_error(f"Health check failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Could not connect to server: {e}")
        print("  Make sure the backend is running on http://localhost:5000")
        return False


def test_fabric_catalog():
    """Test fabric catalog endpoint"""
    print_test("Fabric Catalog")
    
    try:
        response = requests.get(f"{API_URL}/api/fabric/catalog")
        
        if response.status_code == 200:
            data = response.json()
            fabrics = data.get('fabrics', [])
            print_success(f"Retrieved {len(fabrics)} fabrics from catalog")
            
            for fabric in fabrics[:3]:  # Show first 3
                print(f"  - {fabric.get('name')} (ID: {fabric.get('id')})")
            
            return True
        else:
            print_error(f"Catalog request failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print_error(f"Catalog request error: {e}")
        return False


def test_fabric_scan():
    """Test fabric scanning endpoint"""
    print_test("Fabric Scanning")
    
    try:
        # Create test fabric image
        test_image = create_test_image(size=(800, 800), color=(100, 100, 200))
        
        payload = {
            "image": test_image
        }
        
        print("  Sending test fabric image...")
        response = requests.post(
            f"{API_URL}/api/fabric/scan",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print_success("Fabric processed successfully")
            print(f"  Fabric ID: {data.get('fabric_id')}")
            print(f"  Roughness: {data.get('roughness'):.2f}")
            print(f"  Metalness: {data.get('metalness'):.2f}")
            
            # Check if textures were generated
            if 'diffuseUrl' in data and 'normalUrl' in data and 'roughnessUrl' in data:
                print_success("All PBR textures generated")
            
            return True
        else:
            print_error(f"Fabric scan failed with status {response.status_code}")
            try:
                error_data = response.json()
                print(f"  Error: {error_data.get('detail', 'Unknown error')}")
            except:
                pass
            return False
            
    except Exception as e:
        print_error(f"Fabric scan error: {e}")
        return False


def test_virtual_tryon():
    """Test virtual try-on endpoint"""
    print_test("Virtual Try-On (Premium Capture)")
    
    try:
        # Create test images
        user_image = create_test_image(size=(512, 768), color=(200, 150, 100))
        jacket_render = create_test_image(size=(512, 768), color=(50, 50, 150))
        
        payload = {
            "user_image": user_image,
            "jacket_render": jacket_render,
            "pose": None,
            "fabric_id": "denim-blue"
        }
        
        print("  Processing virtual try-on...")
        response = requests.post(
            f"{API_URL}/virtual-tryon",
            json=payload,
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print_success("Virtual try-on completed")
                print(f"  Result ID: {data.get('result_id')}")
                print(f"  Timestamp: {data.get('timestamp')}")
                return True
            else:
                print_error(f"Virtual try-on failed: {data.get('error')}")
                return False
        else:
            print_error(f"Virtual try-on request failed with status {response.status_code}")
            try:
                error_data = response.json()
                print(f"  Error: {error_data.get('detail', 'Unknown error')}")
            except:
                pass
            return False
            
    except Exception as e:
        print_error(f"Virtual try-on error: {e}")
        return False


async def test_websocket():
    """Test WebSocket connection"""
    print_test("WebSocket Connection")
    
    try:
        print("  Connecting to WebSocket...")
        async with websockets.connect(WS_URL) as websocket:
            print_success("WebSocket connected")
            
            # Create test keyframe
            camera_frame = create_test_image(size=(512, 768), color=(200, 150, 100))
            jacket_render = create_test_image(size=(512, 768), color=(50, 50, 150))
            
            message = {
                "type": "keyframe",
                "timestamp": 1234567890,
                "camera_frame": camera_frame,
                "jacket_render": jacket_render,
                "pose": None,
                "fabric_id": "denim-blue"
            }
            
            print("  Sending test keyframe...")
            await websocket.send(json.dumps(message))
            
            print("  Waiting for response...")
            response = await asyncio.wait_for(websocket.recv(), timeout=10.0)
            data = json.loads(response)
            
            if data.get('type') == 'keyframe_result':
                print_success("Received AI-enhanced keyframe")
                print(f"  Mode: {data.get('mode')}")
                return True
            else:
                print_error(f"Unexpected response type: {data.get('type')}")
                return False
                
    except asyncio.TimeoutError:
        print_error("WebSocket response timeout")
        return False
    except Exception as e:
        print_error(f"WebSocket error: {e}")
        return False


def main():
    """Run all tests"""
    print("\n" + "="*60)
    print("Lucy Virtual Try-On Backend - Test Suite")
    print("="*60)
    
    results = {}
    
    # Run tests
    results['health'] = test_health_check()
    
    if not results['health']:
        print("\n" + "="*60)
        print("Backend is not running. Please start the backend first:")
        print("  python main.py")
        print("="*60)
        sys.exit(1)
    
    results['catalog'] = test_fabric_catalog()
    results['scan'] = test_fabric_scan()
    results['tryon'] = test_virtual_tryon()
    
    # WebSocket test (async)
    try:
        results['websocket'] = asyncio.run(test_websocket())
    except Exception as e:
        print_error(f"WebSocket test failed: {e}")
        results['websocket'] = False
    
    # Print summary
    print("\n" + "="*60)
    print("Test Summary")
    print("="*60)
    
    total_tests = len(results)
    passed_tests = sum(1 for v in results.values() if v)
    
    for test_name, result in results.items():
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{test_name.ljust(20)}: {status}")
    
    print("="*60)
    print(f"Results: {passed_tests}/{total_tests} tests passed")
    print("="*60)
    
    # Exit code
    if passed_tests == total_tests:
        print("\n🎉 All tests passed! Backend is working correctly.")
        sys.exit(0)
    else:
        print(f"\n⚠️  {total_tests - passed_tests} test(s) failed. Check the errors above.")
        sys.exit(1)


if __name__ == "__main__":
    # Check dependencies
    try:
        import websockets
    except ImportError:
        print("Error: websockets module not installed")
        print("Install it with: pip install websockets")
        sys.exit(1)
    
    main()

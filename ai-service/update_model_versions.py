"""
Run this after retraining to update model versions in .env and main.py
Usage: python update_model_versions.py <furniture_version> <electrical_version>
Example: python update_model_versions.py 21 3
"""
import sys, re

def update_env(furniture_v: str, electrical_v: str):
    env_path = "../backend/.env"
    with open(env_path, "r") as f:
        content = f.read()

    content = re.sub(
        r"FURNITURE_MODEL=furniture-detection-qiufc/\d+",
        f"FURNITURE_MODEL=furniture-detection-qiufc/{furniture_v}",
        content
    )
    content = re.sub(
        r"ELECTRICAL_MODEL=electrical-appliance/\d+",
        f"ELECTRICAL_MODEL=electrical-appliance/{electrical_v}",
        content
    )
    content = re.sub(
        r"ROBOFLOW_MODEL_ID=furniture-detection-qiufc/\d+",
        f"ROBOFLOW_MODEL_ID=furniture-detection-qiufc/{furniture_v}",
        content
    )

    with open(env_path, "w") as f:
        f.write(content)
    print(f"✅ backend/.env updated")
    print(f"   FURNITURE_MODEL  → furniture-detection-qiufc/{furniture_v}")
    print(f"   ELECTRICAL_MODEL → electrical-appliance/{electrical_v}")

def update_main_py(furniture_v: str, electrical_v: str):
    path = "main.py"
    with open(path, "r") as f:
        content = f.read()

    content = re.sub(
        r'"furniture-detection-qiufc/\d+"',
        f'"furniture-detection-qiufc/{furniture_v}"',
        content
    )
    content = re.sub(
        r'"electrical-appliance/\d+"',
        f'"electrical-appliance/{electrical_v}"',
        content
    )

    with open(path, "w") as f:
        f.write(content)
    print(f"✅ ai-service/main.py updated")

def update_roboflow_service(furniture_v: str):
    path = "../backend/src/services/roboflow.service.ts"
    with open(path, "r") as f:
        content = f.read()

    content = re.sub(
        r"furniture-detection-qiufc/\d+",
        f"furniture-detection-qiufc/{furniture_v}",
        content
    )

    with open(path, "w") as f:
        f.write(content)
    print(f"✅ backend/src/services/roboflow.service.ts updated")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python update_model_versions.py <furniture_version> <electrical_version>")
        print("Example: python update_model_versions.py 21 3")
        sys.exit(1)

    fv = sys.argv[1]
    ev = sys.argv[2]

    print(f"\n🔄 Updating model versions: Furniture→v{fv}, Electrical→v{ev}\n")
    update_env(fv, ev)
    update_main_py(fv, ev)
    update_roboflow_service(fv)

    print(f"""
✅ All files updated. Restart the services:
   Backend:    nodemon will auto-reload
   AI Service: uvicorn will auto-reload
""")

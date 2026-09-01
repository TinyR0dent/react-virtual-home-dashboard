DOMAIN = "ha_dashboard_persistence"
STORAGE_VERSION = 1
STORAGE_KEY = f"{DOMAIN}.config"
PANEL_DIST_DIRNAME = "panel_dist"
PANEL_TARGET_FOLDER = "ha-dashboard"
PANEL_URL_PATH = "ha-dashboard"
PANEL_TITLE = "HA Dashboard"
PANEL_ICON = "mdi:home-floor-0"
CONF_GROUND_MODEL_PATH = "ground_model_path"
CONF_GROUND_NAME = "ground_name"
CONF_FIRST_MODEL_PATH = "first_model_path"
CONF_FIRST_NAME = "first_name"
CONF_FIRST_Y_OFFSET = "first_y_offset"
CONF_SECOND_MODEL_PATH = "second_model_path"
CONF_SECOND_NAME = "second_name"
CONF_SECOND_Y_OFFSET = "second_y_offset"
MAX_FLOORS = 3

FLOOR_CONFIG_SLOTS = [
    {
        "id": "ground",
        "default_name": "Ground Floor",
        "name_key": CONF_GROUND_NAME,
        "model_key": CONF_GROUND_MODEL_PATH,
        "default_model_path": "/local/ha-dashboard/models/ground-floor.glb",
        "offset_key": None,
        "default_offset": 0.0,
        "required_model": True,
    },
    {
        "id": "first",
        "default_name": "First Floor",
        "name_key": CONF_FIRST_NAME,
        "model_key": CONF_FIRST_MODEL_PATH,
        "default_model_path": "/local/ha-dashboard/models/first-floor.glb",
        "offset_key": CONF_FIRST_Y_OFFSET,
        "default_offset": 2.4,
        "required_model": False,
    },
    {
        "id": "second",
        "default_name": "Second Floor",
        "name_key": CONF_SECOND_NAME,
        "model_key": CONF_SECOND_MODEL_PATH,
        "default_model_path": "",
        "offset_key": CONF_SECOND_Y_OFFSET,
        "default_offset": 4.8,
        "required_model": False,
    },
]

DEFAULT_PAYLOAD = {
    "version": 1,
    "bindings": [],
    "global_config": {
        "ambient_level": 45,
        "default_floor_index": 0,
        "default_camera_position": None,
    },
    "floors": [
        {
            "id": "ground",
            "name": "Ground Floor",
            "model_path": "/local/ha-dashboard/models/ground-floor.glb",
            "y_offset": 0.0,
        },
        {
            "id": "first",
            "name": "First Floor",
            "model_path": "/local/ha-dashboard/models/first-floor.glb",
            "y_offset": 2.4,
        },
    ],
}

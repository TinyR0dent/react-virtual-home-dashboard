# 3D Floor Plan Models

Place your Blender exports here. The viewer expects:

| File | Description |
|------|-------------|
| `ground-floor.glb` | Ground floor model |
| `first-floor.glb`  | First floor model  |

## Blender Export Settings

1. **File → Export → glTF 2.0**
2. Format: **glTF Binary (.glb)**
3. Under **Geometry**: enable **Apply Modifiers**
4. Under **Compression**: enable **Draco Mesh Compression** — drastically reduces file size
5. Under **Shading**: enable **Export Lights** if you have Blender lights you want to keep

## Tips for best results

- Apply all transforms in Blender before export (**Object → Apply → All Transforms**)
- Use PBR materials (Principled BSDF) — they map directly to Three.js `MeshStandardMaterial`
- Centre your model at the world origin so it loads centred in the viewer
- Keep polygon count reasonable for wall-mounted tablet performance (~100k–500k tris is fine)

## Naming conventions
- Name objects which you want to attach a HA device to with _*type* e.g. _Floor or _Light.

- the following aliases are accepted:

### Object Aliases
#### Lights
- 'light', 'lamp', 'chandelier', 'sconce'

#### Doors
- 'door', 'gate', 'entrance', 'exit'

#### Areas (For presence)
- 'floor', 'room', 'area', 'zone'
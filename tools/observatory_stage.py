"""Build an original, persistent blocking set. These are proxies, not AI footage.

Run only in a new headless Blender process. No open artist scene is modified.
Writes a .blend, RGB/geometry passes and a machine-readable camera/actor manifest.
"""
import argparse
import json
import math
import sys
import time
from pathlib import Path

import bpy
from mathutils import Vector

parser = argparse.ArgumentParser()
parser.add_argument('--output', required=True)
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
destination = Path(args.output).resolve()
destination.mkdir(parents=True, exist_ok=False)
started = time.monotonic()
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
scene.cycles.use_denoising = True
scene.render.resolution_x = 768
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.frame_start = 1
scene.frame_end = 121
scene.world.color = (0.09, 0.12, 0.2)
scene.view_settings.view_transform = 'AgX'
layer = scene.view_layers[0]
layer.use_pass_z = True
layer.use_pass_normal = True
layer.use_pass_object_index = True


def material(name, color, metal=0, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    shader = m.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = (*color, 1)
    shader.inputs['Metallic'].default_value = metal
    shader.inputs['Roughness'].default_value = 0.5
    if emission:
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = emission
    return m


stone = material('Observatory / blue stone', (0.08, 0.12, 0.17))
tile = material('Observatory / teal tile', (0.045, 0.12, 0.12), 0.15)
brass = material('Observatory / brushed brass', (0.42, 0.25, 0.07), 0.65)
door = material('Observatory / teal door', (0.025, 0.16, 0.18))
orb = material('Signal / amber light', (1, 0.32, 0.035), 0, 4)
orange = material('Mira / orange jacket proxy', (0.5, 0.13, 0.035))
indigo = material('Sol / indigo coat proxy', (0.055, 0.07, 0.2))
skin_mira = material('Mira / head proxy', (0.38, 0.19, 0.1))
skin_sol = material('Sol / head proxy', (0.53, 0.38, 0.24))
charcoal = material('Mira / hair and boots', (0.025, 0.021, 0.035))
silver = material('Sol / hair proxy', (0.44, 0.46, 0.51))
twilight = material('Exterior / twilight', (0.1, 0.15, 0.38), 0, 0.35)


def finish(obj, name, mat, index=10):
    obj.name = name
    obj.data.materials.append(mat)
    obj.pass_index = index
    return obj


def cube(name, location, scale, mat, index=10):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.scale = scale
    return finish(obj, name, mat, index)


def sphere(name, location, scale, mat, index=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    obj = bpy.context.object
    obj.scale = scale
    for p in obj.data.polygons:
        p.use_smooth = True
    return finish(obj, name, mat, index)


def cylinder(name, location, radius, depth, mat, index=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=location)
    return finish(bpy.context.object, name, mat, index)


def ring(name, location, radius, thickness, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=8, location=location,
                                   major_radius=radius, minor_radius=thickness, rotation=rotation)
    return finish(bpy.context.object, name, mat)


cylinder('set.floor', (0, 0.5, -0.12), 4.3, 0.22, stone)
for x in range(-4, 4):
    for y in range(-3, 4):
        if x*x+y*y < 16:
            cube(f'set.tile.{x}.{y}', (x+0.48, y+0.48, 0), (0.95, 0.95, 0.04), tile)
cube('set.back_wall.left', (-2.65, 3.3, 1.8), (2.6, 0.25, 3.6), stone)
cube('set.back_wall.right', (2.8, 3.3, 1.8), (2.3, 0.25, 3.6), stone)
cube('set.window.sill', (0.15, 3.3, 0.52), (3.2, 0.5, 0.22), brass)
cube('set.window.twilight', (0.15, 3.6, 2), (3.2, 0.04, 3), twilight)
for x in [-1.45, -0.38, 0.69, 1.75]:
    cube('set.window.mullion', (x, 3.28, 2), (0.045, 0.055, 3), brass)
cube('set.window.transom', (0.15, 3.28, 2.35), (3.2, 0.055, 0.045), brass)
round_door = cylinder('set.teal_door', (-2.5, 3.13, 1.2), 1.08, 0.12, door)
round_door.rotation_euler.x = math.pi/2
ring('set.door.brass_ring', (-2.5, 3.04, 1.2), 1.04, 0.035, brass, (math.pi/2, 0, 0))
cylinder('prop.console.base', (0, 0.5, 0.45), 0.48, 0.9, brass, 3)
cylinder('prop.console.top', (0, 0.5, 0.92), 1.5, 0.12, brass, 3)
for radius in [0.4, 0.75, 1.1, 1.4]:
    ring('prop.console.orbit', (0, 0.5, 0.99), radius, 0.012, stone)
sphere('prop.signal_orb', (0, 0.5, 1.23), (0.22, 0.22, 0.22), orb, 4)
for rotation in [(0, 0, 0), (1.1, 0.2, 0), (0.3, 1.2, 0)]:
    ring('set.armillary', (0, 0.9, 3.2), 0.75, 0.022, brass, rotation)


def actor(name, x, y, height, coat, skin, hair, index):
    root = bpy.data.objects.new('actor.'+name, None)
    bpy.context.collection.objects.link(root)
    parts = []
    parts.append(sphere(name+'.torso', (x, y, height*0.53), (0.27, 0.17, height*0.27), coat, index))
    parts.append(sphere(name+'.head', (x, y, height*0.88), (0.17, 0.15, 0.21), skin, index))
    parts.append(sphere(name+'.hair', (x, y+0.04, height*0.94), (0.19, 0.15, 0.13), hair, index))
    for offset in [-0.14, 0.14]:
        parts.append(sphere(name+'.leg', (x+offset, y, height*0.22), (0.09, 0.11, height*0.23), charcoal, index))
    for offset in [-0.3, 0.3]:
        parts.append(sphere(name+'.arm', (x+offset, y, height*0.53), (0.07, 0.09, height*0.23), coat, index))
    for part in parts:
        part.parent = root
    root['continuity_role'] = 'Geometric actor proxy. Not an approved character likeness.'
    root['identity'] = name
    return root


actor('mira', -1.12, 1.05, 1.7, orange, skin_mira, charcoal, 1)
actor('sol', 1.14, 1.3, 1.9, indigo, skin_sol, silver, 2)


def area(name, location, energy, color, size, target):
    light = bpy.data.lights.new(name, 'AREA')
    light.energy, light.color, light.shape, light.size = energy, color, 'DISK', size
    obj = bpy.data.objects.new(name, light)
    bpy.context.collection.objects.link(obj)
    obj.location = location
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()


area('light.amber_key', (0, -0.5, 2.3), 250, (1, 0.53, 0.2), 3, (0, 1, 1))
area('light.twilight_rim', (0.4, 2.8, 3), 400, (0.3, 0.45, 1), 3, (0, 0, 1))
area('light.fill', (-3, -1, 2), 120, (0.5, 0.7, 1), 4, (0, 1, 1))

cameras = [
    ('signal', (0, -5.8, 2.65), (0, 0.8, 1.4), 40),
    ('mira', (0.18, -2.4, 1.8), (-1.12, 1.05, 1.45), 65),
    ('sol', (-0.16, -2.4, 1.94), (1.14, 1.3, 1.62), 65),
]
manifest = {'format':'shutter-stage-v1', 'name':'The mountain observatory',
            'kind':'Blender blocking proxies', 'units':'meters', 'blender':bpy.app.version_string,
            'resolution':[768,512], 'fps':24, 'frameRange':[1,121],
            'modelInputCapability':'Not yet connected to a motion-conditioned video model',
            'objectIndex':{'mira':1,'sol':2,'console':3,'orb':4,'set':10}, 'cameras':[]}
for name, position, target, focal in cameras:
    camera = bpy.data.cameras.new('camera.'+name)
    camera.lens = focal
    camera.sensor_width = 36
    obj = bpy.data.objects.new('camera.'+name, camera)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()
    scene.camera = obj
    bpy.context.view_layer.update()
    manifest['cameras'].append({'shotId':name,'position':list(position),'target':list(target),
                              'focalLengthMm':focal,'sensorWidthMm':36,
                              'matrixWorld':[list(row) for row in obj.matrix_world],
                              'rgb':name+'.png','passes':name+'.exr'})
    scene.render.image_settings.media_type = 'MULTI_LAYER_IMAGE'
    scene.render.image_settings.file_format = 'OPEN_EXR_MULTILAYER'
    scene.render.filepath = str(destination/(name+'.exr'))
    bpy.ops.render.render(write_still=True)
    scene.render.image_settings.media_type = 'IMAGE'
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGB'
    bpy.data.images['Render Result'].save_render(str(destination/(name+'.png')), scene=scene)

scene.camera = bpy.data.objects['camera.signal']
scene['shutter_stage'] = 'The Last Light / blocking v1'
scene['shutter_status'] = 'Proxy geometry; not AI footage or final character design.'
bpy.ops.wm.save_as_mainfile(filepath=str(destination/'observatory.blend'))
manifest['objects'] = [{'name':o.name,'matrixWorld':[list(row) for row in o.matrix_world],
                       'objectIndex':o.pass_index} for o in scene.objects if o.type=='MESH']
manifest['elapsedSeconds'] = round(time.monotonic()-started, 2)
(destination/'stage.json').write_text(json.dumps(manifest, indent=2), encoding='utf8')
print('SHUTTER_STAGE_READY '+json.dumps({'path':str(destination),'cameras':3,'elapsedSeconds':manifest['elapsedSeconds']}))

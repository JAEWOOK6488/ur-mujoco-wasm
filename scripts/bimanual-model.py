"""Compose two vendored UR5e arms without duplicating mesh assets."""
from pathlib import Path
import copy
import math
import xml.etree.ElementTree as E
root = Path(__file__).resolve().parents[1] / 'public/model'
source = E.parse(root / 'ur5e.xml').getroot()
out = E.Element('mujoco', model='UR5e bimanual workcell')
for tag in ['compiler', 'option', 'default', 'asset']:
    out.append(copy.deepcopy(source.find(tag)))
out.find('option').set('timestep', '0.002')
world = E.SubElement(out, 'worldbody')
E.SubElement(world, 'geom', name='floor', type='plane', size='3 3 .05', rgba='.3 .4 .5 1')
E.SubElement(world, 'geom', name='table', type='box', pos='0 0 .36', size='.95 .65 .04', rgba='.23 .27 .30 1', friction='1 .005 .0001')
for x in [-.83, .83]:
    for y in [-.53, .53]:
        E.SubElement(world, 'geom', type='box', pos=f'{x} {y} .16', size='.035 .035 .16', rgba='.12 .15 .18 1')
act = E.SubElement(out, 'actuator')
equality = E.SubElement(out, 'equality')
home = [-1.5708, -1.5708, 1.5708, -1.5708, -1.5708, 0]
qpos, ctrl = [], []
for side, x, color in [('left', -.48, '.25 .65 .85 1'), ('right', .48, '.9 .55 .25 1')]:
    body = copy.deepcopy(source.find('worldbody/body'))
    for el in body.iter():
        for attr in ['name', 'joint', 'body', 'site']:
            if attr in el.attrib:
                el.set(attr, side + '_' + el.get(attr))
    body.set('pos', f'{x} .35 .40')
    angle = .30 if side == 'left' else -.83
    body.set('quat', f'{math.cos(angle/2)} 0 0 {math.sin(angle/2)}')
    # Both arms face the shared front workspace, as on a tabletop bimanual rig.
    world.append(body)
    wrist = next(el for el in body.iter('body') if el.get('name') == side+'_wrist_3_link')
    grip = E.SubElement(wrist, 'body', name=side+'_gripper', pos='0 .1 0', quat='-1 1 0 0')
    E.SubElement(grip, 'geom', type='box', pos='0 0 .027', size='.055 .028 .027', rgba=color, mass='.25')
    for i, sign in enumerate([-1, 1]):
        finger = E.SubElement(grip, 'body', name=f'{side}_finger_{i}', pos=f'{sign*.014} 0 .054')
        E.SubElement(finger, 'joint', name=f'{side}_finger_joint_{i}', type='slide', axis=f'{sign} 0 0', range='0 .035', damping='2', armature='.01')
        E.SubElement(finger, 'geom', type='box', pos='0 0 .037', size='.008 .022 .037', rgba='.16 .19 .22 1', mass='.06', friction='1.5 .01 .001')
    E.SubElement(grip, 'site', name=side+'_tcp', pos='0 0 .11')
    E.SubElement(equality, 'joint', joint1=side+'_finger_joint_1', joint2=side+'_finger_joint_0', polycoef='0 1 0 0 0')
    for actuator in source.find('actuator'):
        a = copy.deepcopy(actuator)
        a.set('name', side+'_'+a.get('name'))
        a.set('joint', side+'_'+a.get('joint'))
        act.append(a)
    E.SubElement(act, 'position', name=side+'_grip', joint=side+'_finger_joint_0', kp='200', kv='10', ctrlrange='0 .035', forcerange='-20 20')
    qpos += home + [.035, .035]
    ctrl += home + [.035]
block = E.SubElement(world, 'body', name='block', pos='0 -.25 .435')
E.SubElement(block, 'freejoint', name='block_free')
E.SubElement(block, 'geom', name='block_geom', type='box', size='.03 .03 .035', mass='.08', rgba='.75 .32 .22 1', friction='1.2 .01 .001', condim='4')
qpos += [0, -.25, .435, 1, 0, 0, 0]
key = E.SubElement(out, 'keyframe')
E.SubElement(key, 'key', name='home', qpos=' '.join(map(str,qpos)), ctrl=' '.join(map(str,ctrl)))
E.indent(out)
E.ElementTree(out).write(root/'bimanual.xml', encoding='unicode')
(root/'scene.xml').write_text('<mujoco model="Bimanual laboratory">\n  <include file="bimanual.xml"/>\n</mujoco>\n')

# @File: main.py

import eel
import base64
import os
import time
import mimetypes
from utils.db import list_products, add_product, update_product, create_order, list_orders, update_order_status, cancel_order
from decimal import Decimal
from datetime import datetime

IMG_DIR = os.path.join('web', 'img')

def jsonable(obj):
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, datetime):
        return obj.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(obj, dict):
        return {k: jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [jsonable(x) for x in obj]
    return obj

eel.init('web')

@eel.expose
def api_list_products():
    return jsonable(list_products())

@eel.expose
def api_add_product(data):
    return jsonable(add_product(data))


@eel.expose
def api_update_product(data):
    return jsonable(update_product(data))


@eel.expose
def api_create_order(data):
    return jsonable(create_order(data))


@eel.expose
def api_list_orders(include_picked=False, include_canceled=False):
    return jsonable(list_orders(include_picked, include_canceled))

@eel.expose
def api_update_order_status(order_id, status):
    return jsonable(update_order_status(order_id, status))

@eel.expose
def api_cancel_order(order_id):
    return jsonable(cancel_order(order_id))

@eel.expose
def api_upload_image(filename, data_url):
    if not os.path.exists(IMG_DIR):
        os.makedirs(IMG_DIR)

    if ',' not in data_url:
        raise ValueError('格式錯誤，應為 data:image/xxx;base64,...')

    header, b64 = data_url.split(',', 1)

    ext = '.jpg'
    if 'image/' in header:
        mime = header.split('image/')[1].split(';')[0] 
        ext = '.' + ('jpg' if mime == 'jpeg' else mime)

    new_name = f"{int(time.time() * 1000)}{ext}"
    filepath = os.path.join(IMG_DIR, new_name)

    with open(filepath, 'wb') as f:
        f.write(base64.b64decode(b64))

    return f"img/{new_name}"

if __name__ == '__main__':
    eel.start('index.html', size=(1100, 720), port=0)
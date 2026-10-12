# @db.py

import json
import os
import pymysql as SQL
from decimal import Decimal
from datetime import datetime

# ── 訂單狀態常數 ──
STATUS_PENDING  = 0   # 未完成
STATUS_DONE     = 1   # 已完成
STATUS_PICKED   = 2   # 已取貨
STATUS_CANCELED = 3   # 已取消  ← 新增

STATUS_TEXT = {
    0: '未完成',
    1: '已完成',
    2: '已取貨',
    3: '已取消',
}

#SQL connection
def get_cnxn():
    return SQL.connect(
        host='localhost',
        user='order',
        password=os.environ["ORDER_DB_PW"],
        database='OrderSystem',
        charset='utf8mb4',
        cursorclass=SQL.cursors.DictCursor
    )

#添加商品
def add_product(product: dict) -> int:
    sql = """
        INSERT INTO Products (ProductName, price, img, stock)
        VALUES (%(ProductName)s, %(price)s, %(img)s, %(stock)s)
    """
    data = {
        'ProductName': product['ProductName'],
        'price': product.get('price', 0),
        'img': product.get('img'),
        'stock': product.get('stock', 0),
    }

    cnxn = get_cnxn()
    try:
        with cnxn.cursor() as cursor:
            cursor.execute(sql, data)
            new_id = cursor.lastrowid
        cnxn.commit()
        return new_id
    except Exception:
        cnxn.rollback()
        raise
    finally:
        cnxn.close()

#更新商品狀態
def update_product(product: dict) -> bool:
    sql = """
        UPDATE Products
        SET ProductName = %(ProductName)s,
            price       = %(price)s,
            img         = %(img)s,
            stock       = %(stock)s
        WHERE ProductID = %(ProductID)s
    """
    data = {
        'ProductID':   product['ProductID'],
        'ProductName': product['ProductName'],
        'price':       product.get('price', 0),
        'img':         product.get('img'),
        'stock':       product.get('stock', 0)
    }

    cnxn = get_cnxn()
    try:
        with cnxn.cursor() as cursor:
            affected = cursor.execute(sql, data)
        cnxn.commit()
        return affected > 0
    except Exception:
        cnxn.rollback()
        raise
    finally:
        cnxn.close()

#列出商品
def list_products() -> list[dict]:
    sql = "SELECT ProductID, ProductName, price, img, stock FROM Products ORDER BY ProductID"
    cnxn = get_cnxn()
    try:
        with cnxn.cursor() as cursor:
            cursor.execute(sql)
            return cursor.fetchall()
    finally:
        cnxn.close()

#創建訂單
def create_order(order: dict) -> int:
    customer = order.get('customer', '').strip()
    items = order.get('items', [])

    if not customer:
        raise ValueError('customer 不能為空')
    if not items:
        raise ValueError('items 不能為空')

    cnxn = get_cnxn()
    try:
        with cnxn.cursor() as cursor:
            cursor.execute(
                "INSERT INTO Orders (customer, total_price) VALUES (%s, 0)",
                (customer,)
            )
            order_id = cursor.lastrowid

            total_price = Decimal('0')

            for item in items:
                pid = item['ProductID']
                qty = Decimal(str(item['qty']))

                if qty <= 0:
                    raise ValueError(f'ProductID={pid} 的 qty 必須大於 0')

                cursor.execute(
                    "SELECT ProductName, price, stock FROM Products "
                    "WHERE ProductID = %s FOR UPDATE",
                    (pid,)
                )
                product = cursor.fetchone()
                if product is None:
                    raise ValueError(f'ProductID={pid} 不存在')

                if product['stock'] < qty: 
                    raise ValueError(
                        f"{product['ProductName']} 庫存不足 "
                        f"(需要 {qty}, 剩 {product['stock']})"
                    )

                unit_price = product['price'] 
                btotal = int(qty * unit_price) 

                cursor.execute(
                    "INSERT INTO OrderItems "
                    "(OrderID, ProductID, qty, unit_price, btotal) "
                    "VALUES (%s, %s, %s, %s, %s)",
                    (order_id, pid, qty, unit_price, btotal)
                )

                cursor.execute(
                    "UPDATE Products SET stock = stock - %s WHERE ProductID = %s",
                    (qty, pid)
                )

                total_price += btotal

            cursor.execute(
                "UPDATE Orders SET total_price = %s WHERE OrderID = %s",
                (total_price, order_id)
            )

        cnxn.commit()
        return order_id

    except Exception:
        cnxn.rollback()
        raise
    finally:
        cnxn.close()

#列出訂單並排除已取貨、已取消
def list_orders(include_picked: bool = False,
                include_canceled: bool = False) -> list[dict]:
    cnxn = get_cnxn()
    try:
        with cnxn.cursor() as cursor:
            sql = (
                "SELECT OrderID, customer, total_price, status, created_at "
                "FROM Orders "
            )
            conditions = []
            params = []

            if not include_picked:
                conditions.append("status != %s")
                params.append(STATUS_PICKED)

            if not include_canceled:
                conditions.append("status != %s")
                params.append(STATUS_CANCELED)

            if conditions:
                sql += "WHERE " + " AND ".join(conditions) + " "

            sql += "ORDER BY created_at DESC, OrderID DESC"

            cursor.execute(sql, params)
            orders = cursor.fetchall()

            if not orders:
                return []

            order_ids = [o['OrderID'] for o in orders]
            placeholders = ', '.join(['%s'] * len(order_ids))
            cursor.execute(
                f"SELECT i.ItemID, i.OrderID, i.ProductID, p.ProductName, "
                f"       i.qty, i.unit_price, i.btotal "
                f"FROM OrderItems i "
                f"JOIN Products p ON p.ProductID = i.ProductID "
                f"WHERE i.OrderID IN ({placeholders}) "
                f"ORDER BY i.OrderID, i.ItemID",
                order_ids
            )
            items = cursor.fetchall()

        items_by_order = {}
        for it in items:
            items_by_order.setdefault(it['OrderID'], []).append(it)

        for o in orders:
            o['items'] = items_by_order.get(o['OrderID'], [])
            o['status_text'] = STATUS_TEXT.get(o['status'], '未知')

        return orders

    finally:
        cnxn.close()

#更新訂單狀態
def update_order_status(order_id: int, status: int) -> bool:
    if status not in STATUS_TEXT:
        raise ValueError(f'無效的 status: {status}')

    cnxn = get_cnxn()
    try:
        with cnxn.cursor() as cursor:
            cursor.execute(
                "SELECT 1 FROM Orders WHERE OrderID = %s",
                (order_id,)
            )
            if cursor.fetchone() is None:
                return False

            cursor.execute(
                "UPDATE Orders SET status = %s WHERE OrderID = %s",
                (status, order_id)
            )
        cnxn.commit()
        return True
    except Exception:
        cnxn.rollback()
        raise
    finally:
        cnxn.close()

def default(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, datetime):
        return o.strftime('%Y-%m-%d %H:%M:%S')
    raise TypeError

#取消訂單
def cancel_order(order_id: int) -> bool:
    cnxn = get_cnxn()
    try:
        with cnxn.cursor() as cursor:
            cursor.execute(
                "SELECT status FROM Orders WHERE OrderID = %s FOR UPDATE",
                (order_id,)
            )
            row = cursor.fetchone()
            if row is None:
                return False

            if row['status'] == STATUS_PICKED:
                raise ValueError('已取貨的訂單無法取消')
            if row['status'] == STATUS_CANCELED:
                raise ValueError('訂單已經取消過了')

            cursor.execute(
                "SELECT ProductID, qty FROM OrderItems WHERE OrderID = %s",
                (order_id,)
            )
            items = cursor.fetchall()

            for it in items:
                cursor.execute(
                    "UPDATE Products SET stock = stock + %s "
                    "WHERE ProductID = %s",
                    (it['qty'], it['ProductID'])
                )

            cursor.execute(
                "UPDATE Orders SET status = %s WHERE OrderID = %s",
                (STATUS_CANCELED, order_id)
            )

        cnxn.commit()
        return True

    except Exception:
        cnxn.rollback()
        raise
    finally:
        cnxn.close()

if __name__ == '__main__':
    pid = add_product({'ProductName': '高麗菜', 'price': 33, 'stock': 10})

    oid = create_order({
        'customer': '小明',
        'items': [{'ProductID': pid, 'qty': 2}]
    })
    ok = cancel_order(oid)
    print('取消成功：', ok)
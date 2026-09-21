from __future__ import annotations

import argparse
import json
import re
import unicodedata
from pathlib import Path

import pandas as pd


def key(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]", "", text.lower())


def value(row: pd.Series, *names: str) -> object:
    headers = {key(column): column for column in row.index}
    for name in names:
        column = headers.get(key(name))
        if column is not None:
            return row[column]
    return ""


def text(value_: object) -> str:
    if value_ is None or (isinstance(value_, float) and pd.isna(value_)):
        return ""
    return str(value_).strip()


def number(value_: object, default: float = 0) -> float:
    try:
        if value_ is None or (isinstance(value_, float) and pd.isna(value_)) or text(value_) == "":
            return default
        return float(value_)
    except (TypeError, ValueError):
        return default


def integer(value_: object, default: int = 0) -> int:
    return int(round(number(value_, default)))


def date(value_: object) -> str | None:
    raw = text(value_)
    if not raw:
        return None
    parsed = pd.to_datetime(value_, errors="coerce", dayfirst=True)
    if pd.isna(parsed):
        return raw[:10]
    return parsed.strftime("%Y-%m-%d")


def boolean(value_: object) -> int:
    return 1 if str(value_).strip().lower() in {"true", "1", "sí", "si", "yes", "verdadero"} else 0


def payment_terms(method: str, code: str) -> str:
    if method.upper() == "CONTADO" or code.upper() in {"0D", "0"}:
        return "Contado"
    match = re.search(r"(\d+)", code)
    return f"Pago a {match.group(1)} días" if match else (method or "Pendiente de confirmar")


def normalize_unit(raw: str) -> str:
    return {"UDS": "unidad", "CAJA": "caja", "CAJA6": "caja de 6", "KG": "kg"}.get(raw.upper(), "unidad")


def units_per_case(description: str, unit: str) -> float:
    match = re.search(r"\bC\s*/\s*(\d+)\b", description.upper())
    if match:
        return float(match.group(1))
    if unit.upper() == "CAJA6":
        return 6
    return 1


def prepare(args: argparse.Namespace) -> dict:
    suppliers_df = pd.read_excel(args.suppliers, dtype=object).fillna("")
    clients_df = pd.read_excel(args.clients, dtype=object).fillna("")
    products_df = pd.read_excel(args.products, dtype=object).fillna("")

    suppliers = []
    for _, row in suppliers_df.iterrows():
        code = text(value(row, "Nº", "No", "Codigo"))
        if not code:
            continue
        suppliers.append({
            "source_code": code,
            "name": text(value(row, "Nombre")),
            "tax_id": text(value(row, "CIF/NIF", "CIF")),
            "phone": text(value(row, "Nº teléfono", "Telefono")),
            "contact": text(value(row, "Contacto")),
            "warehouse_code": text(value(row, "Cód. almacén", "Almacen")),
            "balance": number(value(row, "Saldo (DL)", "Saldo")),
            "overdue_balance": number(value(row, "Saldo vencido (DL)", "Saldo vencido")),
            "payments": number(value(row, "Pagos (DL)", "Pagos")),
            "active": 1,
        })

    clients = []
    for _, row in clients_df.iterrows():
        code = text(value(row, "Nº", "No", "Codigo"))
        if not code:
            continue
        closed = date(value(row, "Fecha de baja", "Baja"))
        payment_method = text(value(row, "Cód. forma pago", "Forma pago"))
        payment_code = text(value(row, "Cód. términos pago", "Terminos pago"))
        person = text(value(row, "Nombre"))
        trade_name = text(value(row, "Nombre 2", "Nombre2")) or person
        clients.append({
            "source_code": code,
            "name": trade_name,
            "contact": person,
            "address": text(value(row, "Dirección", "Direccion", "Domicilio")),
            "city": text(value(row, "Población", "Poblacion", "Ciudad")),
            "tax_id": text(value(row, "CIF/NIF", "CIF")),
            "phone": text(value(row, "Nº teléfono", "Telefono")),
            "warehouse_code": text(value(row, "Cód. almacén", "Almacen")),
            "payment_method_code": payment_method,
            "payment_terms_code": payment_code,
            "payment_terms": payment_terms(payment_method, payment_code),
            "balance": number(value(row, "Saldo (DL)", "Saldo")),
            "overdue_balance": number(value(row, "Deuda vencida (DL)", "Deuda vencida")),
            "sales": number(value(row, "Ventas (DL)", "Ventas")),
            "payments": number(value(row, "Pagos (DL)", "Pagos")),
            "source_created_at": date(value(row, "Fecha de alta", "Alta")),
            "source_closed_at": closed,
            "active": 0 if closed else 1,
        })

    products = []
    for _, row in products_df.iterrows():
        code = text(value(row, "Nº", "No", "Codigo"))
        if not code:
            continue
        description = text(value(row, "Descripción", "Descripcion"))
        raw_unit = text(value(row, "Unidad medida base", "Unidad"))
        closed = date(value(row, "Fecha de baja", "Baja"))
        unit = normalize_unit(raw_unit)
        products.append({
            "source_code": code,
            "name": description,
            "description": description,
            "source_type": text(value(row, "Tipo")),
            "stock": number(value(row, "Inventario")),
            "source_substitute": text(value(row, "Existe sustitutivo", "Sustitutivo")),
            "assembly_item": boolean(value(row, "L.M. de ensamblado", "Ensamblado")),
            "cost_adjusted": boolean(value(row, "Coste ajustado", "Coste ajustado")),
            "default_split_template": text(value(row, "Plantilla de fraccionamiento predeterminada", "Fraccionamiento")),
            "base_unit_source": raw_unit,
            "unit": unit,
            "units_per_case": units_per_case(description, raw_unit),
            "cost_price": number(value(row, "Coste unitario", "Coste")),
            "unit_price": number(value(row, "Precio venta", "Precio")),
            "source_supplier_code": text(value(row, "Nº proveedor", "Proveedor")),
            "source_created_at": date(value(row, "Fecha de alta", "Alta")),
            "source_closed_at": closed,
            "active": 0 if closed else 1,
            "valid": bool(description),
        })

    return {
        "source_system": "BC_NAV_REAL",
        "source_files": {
            "clients": args.clients.name,
            "products": args.products.name,
            "suppliers": args.suppliers.name,
        },
        "suppliers": suppliers,
        "clients": clients,
        "products": products,
        "summary": {
            "suppliers": len(suppliers),
            "clients": len(clients),
            "products": len(products),
            "inactive_clients": sum(not item["active"] for item in clients),
            "inactive_products": sum(not item["active"] for item in products),
            "invalid_products": sum(not item["valid"] for item in products),
        },
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--suppliers", type=Path, default=Path(r"C:\Users\luis.vazquez\Downloads\Proveedores.xlsx"))
    parser.add_argument("--clients", type=Path, default=Path(r"C:\Users\luis.vazquez\Downloads\Clientes.xlsx"))
    parser.add_argument("--products", type=Path, default=Path(r"C:\Users\luis.vazquez\Downloads\Productos (3).xlsx"))
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.write_text(json.dumps(prepare(args), ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(prepare(args)["summary"], ensure_ascii=False))

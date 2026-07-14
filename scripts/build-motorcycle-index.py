#!/usr/bin/env python3
"""Build public/data/motorcycles.json from NHTSA vPIC + curated aliases.

Usage:
  python3 scripts/build-motorcycle-index.py
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "motorcycles.json"

BRANDS = [
    ("Honda", ["honda"]),
    ("Yamaha", ["yamaha"]),
    ("Kawasaki", ["kawasaki"]),
    ("Suzuki", ["suzuki"]),
    ("Harley-Davidson", ["harley-davidson", "harley"]),
    ("BMW", ["bmw"]),
    ("Ducati", ["ducati"]),
    ("Triumph", ["triumph"]),
    ("KTM", ["ktm"]),
    ("Indian", ["indian motorcycle"]),
    ("Aprilia", ["aprilia"]),
    ("Moto Guzzi", ["moto guzzi"]),
    ("MV Agusta", ["mv agusta motor"]),
    ("Husqvarna", ["husqvarna"]),
    ("Royal Enfield", ["royal enfield"]),
    ("CFMOTO", ["cfmoto"]),
    ("Can-Am", ["can-am"]),
    ("Buell", ["buell", "buell (ebr)"]),
    ("Victory", ["victory"]),
    ("Benelli", ["benelli"]),
    ("Beta", ["beta"]),
    ("GASGAS", ["gasgas"]),
    ("Zero", ["zero motorcycles"]),
    ("LiveWire", ["livewire"]),
    ("Energica", ["energica"]),
    ("Vespa", ["vespa"]),
    ("Piaggio", ["piaggio and vespa"]),
    ("KYMCO", ["kymco"]),
    ("Ural", ["ural"]),
    ("Norton", ["norton motorcycles"]),
    ("Polaris", ["polaris"]),
]

EXTRAS = {
    "Honda": [
        "CBR600F4i",
        "CBR600F4",
        "CBR600F3",
        "CBR600F2",
        "CBR600F Hurricane",
        "CBR1000RR-R Fireblade",
        "CBR1000RR Fireblade",
        "RC51",
        "VTR1000",
        "Gold Wing",
        "Rebel 500",
        "Rebel 1100",
        "Shadow",
        "VT750",
        "NC700X",
        "NC750X",
        "CTX700",
        "Grom",
        "Monkey",
        "Super Cub",
        "CRF300L",
        "CRF300Rally",
        "XR650L",
    ],
    "Yamaha": [
        "YZF-R1",
        "YZF-R6",
        "YZF-R3",
        "YZF-R7",
        "MT-07",
        "MT-09",
        "MT-10",
        "FZ-07",
        "FZ-09",
        "FZ1",
        "FZ6",
        "VMAX",
        "FJR1300",
        "XSR700",
        "XSR900",
        "Tenere 700",
        "TW200",
        "XT250",
        "Bolt",
        "V Star",
        "Road Star",
    ],
    "Kawasaki": [
        "Ninja ZX-6R",
        "Ninja ZX-10R",
        "Ninja ZX-14R",
        "Ninja 400",
        "Ninja 650",
        "Ninja H2",
        "Z900",
        "Z650",
        "Z400",
        "Versys 650",
        "Versys 1000",
        "KLR650",
        "Vulcan S",
        "Concours 14",
        "W800",
    ],
    "Suzuki": [
        "GSX-R600",
        "GSX-R750",
        "GSX-R1000",
        "GSX-R1000R",
        "Hayabusa",
        "SV650",
        "SV1000",
        "GSX-S750",
        "GSX-S1000",
        "Katana",
        "V-Strom 650",
        "V-Strom 1050",
        "DR-Z400SM",
        "DR650",
        "Boulevard",
    ],
    "Harley-Davidson": [
        "Sportster",
        "Iron 883",
        "Forty-Eight",
        "Street Glide",
        "Road Glide",
        "Road King",
        "Softail",
        "Fat Boy",
        "Breakout",
        "Low Rider",
        "Pan America",
        "Nightster",
        "Heritage Classic",
    ],
}


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "kisalafilms-build/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def clean_model(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def main() -> None:
    makes: dict[str, list[str]] = {}
    for display, queries in BRANDS:
        models: set[str] = set()
        for q in queries:
            url = (
                "https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/"
                f"{urllib.parse.quote(q)}/vehicletype/moto?format=json"
            )
            try:
                data = fetch(url)
            except Exception as exc:  # noqa: BLE001
                print(f"FAIL {display} / {q}: {exc}")
                continue
            for row in data.get("Results") or []:
                name = clean_model(row.get("Model_Name") or "")
                if len(name) < 2 or name.isdigit():
                    continue
                models.add(name)
            time.sleep(0.15)
        models.update(EXTRAS.get(display, []))
        makes[display] = sorted(models, key=lambda s: s.upper())
        print(f"{display}: {len(makes[display])} models")

    search = [f"{make} {model}" for make, models in makes.items() for model in models]
    payload = {
        "source": "NHTSA vPIC GetModelsForMakeYear vehicletype=moto + curated aliases",
        "yearMin": 1985,
        "yearMax": 2026,
        "makeCount": len(makes),
        "modelCount": sum(len(v) for v in makes.values()),
        "makes": makes,
        "search": search,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(search)} search entries)")


if __name__ == "__main__":
    main()

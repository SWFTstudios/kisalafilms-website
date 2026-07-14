#!/usr/bin/env python3
"""Build public/data/motorcycles.json from NHTSA vPIC + curated aliases.

Includes heuristic fairing R&R labor bands for backend quoting:
  uninstall + reinstall bodywork around a wrap (not film install time).

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
        "CBR600F4i", "CBR600F4", "CBR600F3", "CBR600F2", "CBR600F Hurricane",
        "CBR1000RR-R Fireblade", "CBR1000RR Fireblade", "RC51", "VTR1000",
        "Gold Wing", "Rebel 500", "Rebel 1100", "Shadow", "VT750",
        "NC700X", "NC750X", "CTX700", "Grom", "Monkey", "Super Cub",
        "CRF300L", "CRF300Rally", "XR650L",
    ],
    "Yamaha": [
        "YZF-R1", "YZF-R6", "YZF-R3", "YZF-R7", "MT-07", "MT-09", "MT-10",
        "FZ-07", "FZ-09", "FZ1", "FZ6", "VMAX", "FJR1300", "XSR700", "XSR900",
        "Tenere 700", "TW200", "XT250", "Bolt", "V Star", "Road Star",
    ],
    "Kawasaki": [
        "Ninja ZX-6R", "Ninja ZX-10R", "Ninja ZX-14R", "Ninja 400", "Ninja 650",
        "Ninja H2", "Z900", "Z650", "Z400", "Versys 650", "Versys 1000",
        "KLR650", "Vulcan S", "Concours 14", "W800",
    ],
    "Suzuki": [
        "GSX-R600", "GSX-R750", "GSX-R1000", "GSX-R1000R", "Hayabusa",
        "SV650", "SV1000", "GSX-S750", "GSX-S1000", "Katana", "V-Strom 650",
        "V-Strom 1050", "DR-Z400SM", "DR650", "Boulevard",
    ],
    "Harley-Davidson": [
        "Sportster", "Iron 883", "Forty-Eight", "Street Glide", "Road Glide",
        "Road King", "Softail", "Fat Boy", "Breakout", "Low Rider", "Pan America",
        "Nightster", "Heritage Classic",
    ],
}

LABOR_BANDS = {
    "naked_minimal": {
        "id": "naked_minimal",
        "label": "Naked / cafe — little to no bodywork",
        "difficulty": 1,
        "fairingRrHours": {"low": 0.5, "high": 1.5},
        "notes": "Tank focus; mirrors/light surrounds only. Fastest R&R.",
    },
    "cruiser_simple": {
        "id": "cruiser_simple",
        "label": "Cruiser / bobber — tank + fenders",
        "difficulty": 2,
        "fairingRrHours": {"low": 1.0, "high": 2.5},
        "notes": "Tank, front/rear fenders, side covers. Few fasteners; watch tank vent/petcock.",
    },
    "half_faired": {
        "id": "half_faired",
        "label": "Half fairing / sport-touring",
        "difficulty": 3,
        "fairingRrHours": {"low": 2.0, "high": 4.0},
        "notes": "Headlight cowl or belly pan + tank. More clips than a naked; less than a full race fairing.",
    },
    "adventure_touring": {
        "id": "adventure_touring",
        "label": "Adventure / dual-sport panels",
        "difficulty": 3,
        "fairingRrHours": {"low": 2.5, "high": 5.0},
        "notes": "Radiator shrouds, beak, tank plastics, side panels. Brittle aging plastics common.",
    },
    "full_sport": {
        "id": "full_sport",
        "label": "Full fairing sportbike",
        "difficulty": 4,
        "fairingRrHours": {"low": 4.0, "high": 8.0},
        "notes": "Upper/lower fairings, side panels, tank, seat cowl, often ram-air ducts.",
    },
    "touring_complex": {
        "id": "touring_complex",
        "label": "Touring / bagger — complex plastics",
        "difficulty": 5,
        "fairingRrHours": {"low": 6.0, "high": 12.0},
        "notes": "Fairing, lowers, bags, trunk interfaces. Plan a full day for R&R alone on big baggers.",
    },
    "scooter_enclosed": {
        "id": "scooter_enclosed",
        "label": "Scooter / covered plastics",
        "difficulty": 3,
        "fairingRrHours": {"low": 3.0, "high": 6.0},
        "notes": "Many interlocking body panels; watch wiring and floorboard plastics.",
    },
    "dirt_mx": {
        "id": "dirt_mx",
        "label": "Dirt / MX plastics",
        "difficulty": 2,
        "fairingRrHours": {"low": 1.0, "high": 3.0},
        "notes": "Number plates, fenders, side panels. Fast; plastics flex differently than street fairings.",
    },
    "sidecar_utv": {
        "id": "sidecar_utv",
        "label": "Sidecar / UTV / specialty",
        "difficulty": 5,
        "fairingRrHours": {"low": 4.0, "high": 10.0},
        "notes": "Nonstandard panels — quote after photos.",
    },
    "unknown": {
        "id": "unknown",
        "label": "Unclassified — confirm panels from photos",
        "difficulty": 3,
        "fairingRrHours": {"low": 2.0, "high": 6.0},
        "notes": "Heuristic miss. Ask for photos before locking labor.",
    },
}

OVERRIDES = {
    ("Honda", "CBR600F4i"): "full_sport",
    ("Honda", "CBR600F4"): "full_sport",
    ("Honda", "CBR600RR"): "full_sport",
    ("Honda", "Gold Wing"): "touring_complex",
    ("Honda", "Grom"): "naked_minimal",
    ("Honda", "Monkey"): "naked_minimal",
    ("Honda", "Rebel 500"): "cruiser_simple",
    ("Honda", "Rebel 1100"): "cruiser_simple",
    ("Yamaha", "YZF-R1"): "full_sport",
    ("Yamaha", "YZF-R6"): "full_sport",
    ("Yamaha", "MT-07"): "naked_minimal",
    ("Yamaha", "MT-09"): "naked_minimal",
    ("Kawasaki", "Ninja ZX-6R"): "full_sport",
    ("Kawasaki", "Ninja ZX-10R"): "full_sport",
    ("Kawasaki", "Z900"): "naked_minimal",
    ("Suzuki", "GSX-R600"): "full_sport",
    ("Suzuki", "GSX-R750"): "full_sport",
    ("Suzuki", "Hayabusa"): "full_sport",
    ("Suzuki", "SV650"): "naked_minimal",
    ("Harley-Davidson", "Street Glide"): "touring_complex",
    ("Harley-Davidson", "Road Glide"): "touring_complex",
    ("Harley-Davidson", "Sportster"): "cruiser_simple",
    ("Harley-Davidson", "Pan America"): "adventure_touring",
}

MAKE_DEFAULT = {
    "Harley-Davidson": "cruiser_simple",
    "Indian": "cruiser_simple",
    "Victory": "cruiser_simple",
    "Ural": "cruiser_simple",
    "Vespa": "scooter_enclosed",
    "Piaggio": "scooter_enclosed",
    "KYMCO": "scooter_enclosed",
    "Can-Am": "sidecar_utv",
    "Polaris": "sidecar_utv",
    "Zero": "naked_minimal",
    "LiveWire": "naked_minimal",
    "Energica": "naked_minimal",
    "Royal Enfield": "cruiser_simple",
    "Beta": "dirt_mx",
    "GASGAS": "dirt_mx",
    "Husqvarna": "dirt_mx",
    "Buell": "naked_minimal",
    "Norton": "naked_minimal",
    "CFMOTO": "naked_minimal",
    "Benelli": "naked_minimal",
}


def fetch(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": "kisalafilms-build/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def clean_model(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip()


def classify(make: str, model: str) -> str:
    if (make, model) in OVERRIDES:
        return OVERRIDES[(make, model)]
    mu = re.sub(r"[^a-z0-9]+", " ", model.lower()).strip()
    tokens = set(mu.split())

    if make in ("Vespa", "Piaggio", "KYMCO"):
        return "scooter_enclosed"
    if make in ("Can-Am", "Polaris"):
        return "scooter_enclosed" if tokens & {"spyder", "ryker"} else "sidecar_utv"
    if make in ("Beta", "GASGAS"):
        return "dirt_mx"
    if make == "Benelli":
        if "trk" in mu or "tre-k" in mu or "trek" in mu:
            return "adventure_touring"
        if "tornado" in mu:
            return "full_sport"
        if "imperiale" in mu or "cruiser" in mu:
            return "cruiser_simple"
        if "panarea" in mu or "zafferano" in mu or "caffenero" in mu:
            return "scooter_enclosed"
        return "naked_minimal"

    if any(x in mu for x in (
        "adv150", "adv160", "pcx", "ruckus", "forza", "burgman", "helix",
        "reflex", "silver wing", "scooter", "metropolis", "mp3",
    )):
        return "scooter_enclosed"
    if any(x in mu for x in ("atc", "big red", "pioneer", "talon")):
        return "sidecar_utv"
    if "cota" in mu or "trial" in mu:
        return "dirt_mx"

    if any(x in mu for x in (
        "gold wing", "goldwing", "street glide", "road glide", "electra", "road king",
        "tri glide", "ultra limited", "ultra classic", "pursuit", "fjr", "concours",
        "k1600", "r1250rt", "r1200rt", "bagger", "star venture", "royal star",
    )) or tokens & {"glide", "bagger"}:
        return "touring_complex"

    if any(x in mu for x in (
        "cbr", "gsx r", "gsxr", "ninja zx", "zx 6", "zx 10", "zx 14", "yzf",
        "fireblade", "hayabusa", "panigale", "supersport", "rsv4", "rs 660",
        "s1000rr", "hp4", "daytona", "rc51", "vtr1000", "ninja h2", "zx6r", "zx10r",
    )):
        if tokens & {"tuono", "streetfighter", "monster"}:
            return "naked_minimal"
        return "full_sport"
    if "ninja" in mu:
        return "half_faired" if tokens & {"400", "500", "650"} else "full_sport"
    if re.search(r"\brr\b", mu) and make in (
        "Honda", "Yamaha", "Kawasaki", "Suzuki", "BMW", "Aprilia", "MV Agusta"
    ):
        return "full_sport"

    if any(x in mu for x in (
        "africa", "tenere", "versys", "v strom", "vstrom", "multistrada", "tiger",
        "himalayan", "adventure", "f850gs", "f750gs", "f900gs", "r1250gs", "r1200gs",
        "nc700x", "nc750x", "cb500x", "klr", "dr650", "xr650", "pan america",
        "transalp", "crf300l", "crf250l", "crf300 rally", "ctx700", "nc700", "nc750",
    )) or (tokens & {"gs", "gsa"} and make == "BMW"):
        return "adventure_touring"

    if any(x in mu for x in ("motocross", "enduro", "cross country")) or re.search(
        r"\b(crf|cr|yz|wr|kx|klx|rm|rmz|exc|sxf|xc|tc|fc|te|fe|fx)\s?\d", mu
    ):
        return "dirt_mx"

    if re.match(r"cb\d", mu.replace(" ", "")) or mu.startswith("cb "):
        if "500x" in mu or mu.endswith(" x") or mu.endswith("x"):
            if "cbr" in mu:
                return "full_sport"
            if re.search(r"cb\d+x", mu.replace(" ", "")):
                return "adventure_touring"
        return "naked_minimal"
    if "cbf" in mu:
        return "half_faired"
    if any(x in mu for x in ("cm250", "cm400", "cm450", "cx500", "cx650", "shadow", "magna", "sabre", "nighthawk")):
        return "cruiser_simple"
    if "cbx" in mu or re.match(r"cg\d", mu.replace(" ", "")):
        return "naked_minimal"

    if make in ("Harley-Davidson", "Indian", "Victory", "Ural") or any(
        x in mu
        for x in (
            "shadow", "rebel", "vulcan", "boulevard", "v star", "vstar", "road star",
            "sportster", "softail", "fat boy", "fatboy", "breakout", "low rider",
            "nightster", "scout", "chief", "chieftain", "springfield", "bolt",
            "meteor", "intruder", "marauder", "heritage", "forty eight", "iron 883",
            "street bob", "fat bob", "wide glide", "lowrider",
        )
    ):
        if tokens & {"glide", "ultra", "limited", "king"} or "electra" in mu:
            return "touring_complex"
        return "cruiser_simple"

    if any(x in mu for x in (
        "mt 07", "mt 09", "mt 10", "mt07", "mt09", "mt10", "mt 03", "mt03",
        "fz ", "fz07", "fz09", "fz1", "fz6", "fz8", "z900", "z650", "z400",
        "z300", "z125", "z800", "z1000", "cb1000r", "cb650r", "cb300r", "cb500f",
        "hornet", "duke", "sv650", "sv1000", "monster", "streetfighter", "tuono",
        "brutale", "xsr", "scrambler", "bonneville", "thruxton", "trident", "grom",
        "monkey", "super cub", "s1000r", "f900r", "diavel", "hypermotard",
        "dragster", "r nine", "rninet", "street triple", "speed triple",
        "street twin", "speed twin",
    )):
        return "naked_minimal"

    if "interceptor" in mu or "continental" in mu:
        return "half_faired"
    if "tracer" in mu or "katana" in mu or "bandit" in mu or "fazer" in mu:
        return "half_faired"

    if make == "BMW":
        if "gs" in mu:
            return "adventure_touring"
        if "rr" in mu:
            return "full_sport"
        if "rt" in mu or "k1600" in mu:
            return "touring_complex"
        return "naked_minimal"
    if make == "Ducati":
        if "multi" in mu:
            return "adventure_touring"
        if "panigale" in mu or "supersport" in mu:
            return "full_sport"
        return "naked_minimal"
    if make == "KTM":
        if "adventure" in mu:
            return "adventure_touring"
        if "duke" in mu or "supermoto" in mu or "smc" in mu:
            return "naked_minimal"
        if re.search(r"\b(exc|sx|xc)\b", mu):
            return "dirt_mx"
        return "naked_minimal"
    if make == "Aprilia":
        if "tuono" in mu:
            return "naked_minimal"
        if "rsv" in mu or re.search(r"\brs\b", mu):
            return "full_sport"
        if "caponord" in mu:
            return "adventure_touring"
        return "naked_minimal"
    if make == "Triumph":
        if "tiger" in mu:
            return "adventure_touring"
        if "daytona" in mu:
            return "full_sport"
        if "rocket" in mu or "thunderbird" in mu:
            return "cruiser_simple"
        return "naked_minimal"
    if make == "Moto Guzzi":
        if "v85" in mu:
            return "adventure_touring"
        return "cruiser_simple"
    if make == "MV Agusta":
        if any(x in mu for x in ("f3", "f4", "superveloce")):
            return "full_sport"
        return "naked_minimal"
    if make == "Husqvarna":
        if "norden" in mu:
            return "adventure_touring"
        if "svartpilen" in mu or "vitpilen" in mu:
            return "naked_minimal"
        return "dirt_mx"
    if make == "Yamaha":
        if any(x in mu for x in ("vstar", "v star", "road star", "warrior", "raider", "stryker")):
            return "cruiser_simple"
        if any(x in mu for x in ("r1", "r6", "r3", "r7")) and "tracer" not in mu:
            return "full_sport"
        if "tw200" in mu or "xt" in mu:
            return "adventure_touring"
        return "naked_minimal"
    if make == "Suzuki":
        if "boulevard" in mu or "intruder" in mu or "marauder" in mu:
            return "cruiser_simple"
        if "gsx r" in mu or "gsxr" in mu or "hayabusa" in mu:
            return "full_sport"
        if "v strom" in mu or "vstrom" in mu:
            return "adventure_touring"
        return "naked_minimal"
    if make == "Kawasaki":
        if "vulcan" in mu:
            return "cruiser_simple"
        if "versys" in mu or "klr" in mu:
            return "adventure_touring"
        if "ninja" in mu:
            return "half_faired" if tokens & {"400", "500", "650"} else "full_sport"
        return "naked_minimal"
    if make == "Honda":
        return "naked_minimal"

    return MAKE_DEFAULT.get(make, "unknown")


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

    bikes = []
    for make, models in makes.items():
        for model in models:
            body = classify(make, model)
            bikes.append({"l": f"{make} {model}", "m": make, "o": model, "c": body})

    payload = {
        "source": "NHTSA vPIC motorcycle models + curated aliases; fairing R&R hours are quoting heuristics",
        "laborNote": (
            "fairingRrHours = estimated uninstall+reinstall of bodywork around a wrap "
            "(not film install time). Starting bands only — refine with photos and timed jobs."
        ),
        "yearMin": 1985,
        "yearMax": 2026,
        "makeCount": len(makes),
        "modelCount": len(bikes),
        "laborBands": LABOR_BANDS,
        "bikes": bikes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(bikes)} bikes)")


if __name__ == "__main__":
    main()

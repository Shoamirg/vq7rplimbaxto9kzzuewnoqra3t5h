"""Reusable, modular seeding framework for GarageOS.

Each module seeds one dataset and is independently importable, so individual
datasets can be reseeded without rerunning everything. ``demo.py`` orchestrates
a full, realistic demo database:

    python -m app.seeds.demo            # seed (idempotent)
    python -m app.seeds.demo --fresh    # wipe tenant demo data, then reseed
"""

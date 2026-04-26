"""Pruebas unitarias para services/scoring.py.

Funciones puras (sin dependencias de BBDD ni red): se testean exhaustivamente
con casos límite y entradas degeneradas.
"""
from __future__ import annotations

import pytest

from services.scoring import (
    SCORE_MIN, SCORE_MAX,
    UMBRALES,
    valoracion_intrinseca,
    subscore_by_distance,
    compute_score_contexto,
    compute_score_final,
    generar_huella_digital,
    CONTEXT_WEIGHTS,
    W_INTRINSECO, W_CONTEXTO,
)


# ── valoracion_intrinseca ───────────────────────────────────────────────────

class TestValoracionIntrinseca:
    """Score intrínseco basado en precio (alquiler) o €/m² (venta)."""

    def test_rent_at_or_below_min_returns_max_score(self):
        # 700 €/mes es el límite inferior → score máximo (95)
        piso = {"price": 700, "size": 70, "operation": "rent"}
        assert valoracion_intrinseca(piso) == SCORE_MAX

    def test_rent_at_or_above_max_returns_min_score(self):
        # 2000 €/mes es el límite superior → score mínimo (10)
        piso = {"price": 2000, "size": 70, "operation": "rent"}
        assert valoracion_intrinseca(piso) == SCORE_MIN

    def test_rent_midpoint_yields_midpoint_score(self):
        # 1350 €/mes es el punto medio del rango (700-2000) → score medio
        piso = {"price": 1350, "size": 70, "operation": "rent"}
        score = valoracion_intrinseca(piso)
        expected = (SCORE_MIN + SCORE_MAX) / 2
        assert abs(score - expected) < 0.5

    def test_sale_uses_price_per_m2(self):
        # 200_000€ / 100m² = 2000 €/m² (límite inferior venta) → score máximo
        piso = {"price": 200_000, "size": 100, "operation": "sale"}
        assert valoracion_intrinseca(piso) == SCORE_MAX

    def test_sale_above_max_per_m2_returns_min(self):
        # 800_000€ / 100m² = 8000 €/m² > umbral.max (7000) → score mínimo
        piso = {"price": 800_000, "size": 100, "operation": "sale"}
        assert valoracion_intrinseca(piso) == SCORE_MIN

    def test_sale_with_zero_size_returns_min(self):
        # División entre 0 ⇒ devuelve score mínimo sin crashear
        piso = {"price": 100_000, "size": 0, "operation": "sale"}
        assert valoracion_intrinseca(piso) == SCORE_MIN

    def test_zero_price_returns_min_score(self):
        piso = {"price": 0, "size": 70, "operation": "rent"}
        assert valoracion_intrinseca(piso) == 10.0

    def test_negative_price_returns_min_score(self):
        piso = {"price": -100, "size": 70, "operation": "rent"}
        assert valoracion_intrinseca(piso) == 10.0

    def test_unknown_operation_does_not_crash(self):
        # La función usa UMBRALES de rent como fallback pero el cálculo
        # toma la rama "else" (price/size). El comportamiento exacto es
        # discutible (code smell), pero al menos no debe crashear y debe
        # devolver un score dentro del rango válido.
        piso = {"price": 1000, "size": 70, "operation": "swap"}
        score = valoracion_intrinseca(piso)
        assert SCORE_MIN <= score <= SCORE_MAX

    def test_score_always_in_bounds(self):
        # Cualquier entrada razonable → score ∈ [SCORE_MIN, SCORE_MAX]
        for price in [100, 500, 1000, 1500, 2500, 5000, 100_000]:
            for op in ["rent", "sale"]:
                score = valoracion_intrinseca({"price": price, "size": 80, "operation": op})
                assert SCORE_MIN <= score <= SCORE_MAX, f"score={score} fuera de [{SCORE_MIN},{SCORE_MAX}]"

    def test_returns_float_rounded_to_2_decimals(self):
        piso = {"price": 1234, "size": 70, "operation": "rent"}
        score = valoracion_intrinseca(piso)
        # round(x, 2) garantiza max 2 decimales
        assert score == round(score, 2)


# ── subscore_by_distance ────────────────────────────────────────────────────

class TestSubscoreByDistance:
    """Curva de subscore por distancia: 100 a ≤300m, decae lineal a 0 en 2km."""

    @pytest.mark.parametrize("meters,expected", [
        (0,    100.0),    # justo encima → máximo
        (300,  100.0),    # límite del primer tramo
        (450,  85.0),     # mitad del 2º tramo (300-600 → 100-70)
        (600,  70.0),     # límite tramo 2-3
        (800,  55.0),     # mitad del 3er tramo (600-1000 → 70-40)
        (1000, 40.0),     # límite tramo 3-4
        (1500, 20.0),     # mitad del 4º tramo (1000-2000 → 40-0)
        (2000, 0.0),      # final de la curva
        (3000, 0.0),      # más allá → cero
    ])
    def test_curve_breakpoints(self, meters, expected):
        score = subscore_by_distance(meters)
        assert abs(score - expected) < 0.01, f"distancia={meters}m, esperado≈{expected}, obtenido={score}"

    def test_none_returns_zero(self):
        assert subscore_by_distance(None) == 0.0

    def test_negative_distance_returns_zero(self):
        # Tratamos negativos como inválidos
        assert subscore_by_distance(-50) == 0.0

    def test_score_monotonically_decreasing(self):
        # Más lejos nunca es mejor que más cerca
        prev = subscore_by_distance(0)
        for d in [100, 300, 450, 600, 800, 1000, 1500, 1999, 2000]:
            current = subscore_by_distance(d)
            assert current <= prev, f"distancia {d}m da score {current} > previo {prev}"
            prev = current


# ── compute_score_contexto ──────────────────────────────────────────────────

class TestComputeScoreContexto:
    """Media ponderada de los 6 subscores por categoría."""

    def test_all_zero_distances_yield_max_context(self):
        # Todos los POI a 0m → todos con subscore 100 → media ponderada = 100
        distances = {f"dist_{cat}_m": 0 for cat in CONTEXT_WEIGHTS}
        assert compute_score_contexto(distances) == 100.0

    def test_all_far_distances_yield_zero(self):
        distances = {f"dist_{cat}_m": 5000 for cat in CONTEXT_WEIGHTS}
        assert compute_score_contexto(distances) == 0.0

    def test_all_none_yield_zero(self):
        # Sin POIs → todos los subscores son 0
        distances = {f"dist_{cat}_m": None for cat in CONTEXT_WEIGHTS}
        assert compute_score_contexto(distances) == 0.0

    def test_partial_data_uses_only_present_keys(self):
        # Solo transporte cerca, resto sin datos
        distances = {f"dist_{cat}_m": None for cat in CONTEXT_WEIGHTS}
        distances["dist_transport_m"] = 100  # → subscore 100
        # Peso de transporte = 30, rest = 0 → score total = 30
        assert compute_score_contexto(distances) == 30.0

    def test_weights_sum_to_100(self):
        # Invariante de diseño: los pesos deben sumar 100
        assert sum(CONTEXT_WEIGHTS.values()) == 100

    def test_returns_float_rounded_to_2_decimals(self):
        distances = {"dist_transport_m": 250, "dist_health_m": 800,
                     "dist_education_m": 1500, "dist_park_m": 400,
                     "dist_commerce_m": 600, "dist_bike_m": 1000}
        score = compute_score_contexto(distances)
        assert score == round(score, 2)


# ── compute_score_final ─────────────────────────────────────────────────────

class TestComputeScoreFinal:
    """Mezcla ponderada de score_intrinseco (40%) y score_contexto (60%)."""

    def test_combination_basic(self):
        # 50 * 0.4 + 80 * 0.6 = 20 + 48 = 68
        assert compute_score_final(50, 80) == 68.0

    def test_handles_none_intrinseco(self):
        # None → 0
        assert compute_score_final(None, 100) == round(W_CONTEXTO * 100, 2)

    def test_handles_none_contexto(self):
        assert compute_score_final(100, None) == round(W_INTRINSECO * 100, 2)

    def test_both_none_returns_zero(self):
        assert compute_score_final(None, None) == 0.0

    def test_weights_sum_to_one(self):
        assert abs(W_INTRINSECO + W_CONTEXTO - 1.0) < 1e-9

    def test_max_inputs_yield_max_output(self):
        assert compute_score_final(100, 100) == 100.0


# ── generar_huella_digital ──────────────────────────────────────────────────

class TestGenerarHuellaDigital:
    """Hash MD5 sobre atributos clave para detectar duplicados de Idealista."""

    def test_same_input_yields_same_hash(self):
        piso = {"address": "Calle Sol 1", "price": 1000, "size": 70, "rooms": 2, "floor": "3"}
        assert generar_huella_digital(piso) == generar_huella_digital(piso)

    def test_different_address_yields_different_hash(self):
        a = {"address": "Calle Sol 1", "price": 1000, "size": 70, "rooms": 2, "floor": "3"}
        b = {"address": "Calle Sol 2", "price": 1000, "size": 70, "rooms": 2, "floor": "3"}
        assert generar_huella_digital(a) != generar_huella_digital(b)

    def test_different_price_yields_different_hash(self):
        a = {"address": "Calle X 1", "price": 1000, "size": 70, "rooms": 2, "floor": "3"}
        b = {"address": "Calle X 1", "price": 1500, "size": 70, "rooms": 2, "floor": "3"}
        assert generar_huella_digital(a) != generar_huella_digital(b)

    def test_address_normalized_lowercase_and_stripped(self):
        a = {"address": "Calle Sol 1", "price": 1000, "size": 70, "rooms": 2, "floor": "3"}
        b = {"address": "  CALLE SOL 1  ", "price": 1000, "size": 70, "rooms": 2, "floor": "3"}
        assert generar_huella_digital(a) == generar_huella_digital(b)

    def test_floor_truncated_at_10_chars(self):
        # El truncado en floor[:10] previene que floors largos den hashes distintos
        a = {"address": "Calle X", "price": 1000, "size": 70, "rooms": 2, "floor": "1234567890"}
        b = {"address": "Calle X", "price": 1000, "size": 70, "rooms": 2, "floor": "1234567890XX"}
        assert generar_huella_digital(a) == generar_huella_digital(b)

    def test_returns_32_char_hex(self):
        piso = {"address": "X", "price": 1, "size": 1, "rooms": 1, "floor": "1"}
        h = generar_huella_digital(piso)
        assert len(h) == 32  # MD5 en hex
        assert all(c in "0123456789abcdef" for c in h)

    def test_missing_fields_default_to_zero(self):
        # Si faltan campos → valores por defecto, no excepción
        piso = {}
        h = generar_huella_digital(piso)
        assert len(h) == 32  # Sigue produciendo hash válido


# ── Invariantes globales ────────────────────────────────────────────────────

class TestUmbrales:
    """Smoke tests de la configuración de UMBRALES."""

    def test_rent_min_lt_max(self):
        assert UMBRALES["rent"]["min"] < UMBRALES["rent"]["max"]

    def test_sale_min_lt_max(self):
        assert UMBRALES["sale"]["min"] < UMBRALES["sale"]["max"]

    def test_score_min_lt_max(self):
        assert SCORE_MIN < SCORE_MAX

from app.schemas.vehicle import VehicleResponse


def test_vehicle_response_model_name_does_not_conflict_with_pydantic_namespace():
    assert VehicleResponse.model_config.get("protected_namespaces") == ()
    assert "model_name" in VehicleResponse.model_fields

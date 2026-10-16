import pytest
from pydantic import ValidationError

from app.schemas.customer_portal import RoadsideAttachmentRequest, RoadsideRequest


@pytest.mark.parametrize("kind", ["photo", "voice"])
def test_roadside_attachment_rejects_media_until_real_upload_exists(kind):
    with pytest.raises(ValidationError):
        RoadsideAttachmentRequest(kind=kind, label="placeholder only")


def test_roadside_location_attachment_requires_valid_coordinates():
    with pytest.raises(ValidationError):
        RoadsideAttachmentRequest(kind="location", label="No coordinates")

    with pytest.raises(ValidationError):
        RoadsideAttachmentRequest(kind="location", label="Invalid coordinates", lat=91, lng=0)

    location = RoadsideAttachmentRequest(kind="location", label="Shared location", lat=40.1, lng=69.2)
    assert location.kind == "location"


def test_roadside_request_validates_description_and_coordinate_pair():
    with pytest.raises(ValidationError):
        RoadsideRequest(description="   ")
    with pytest.raises(ValidationError):
        RoadsideRequest(description="Help", location_lat=40.1)

    request = RoadsideRequest(description="  Need help  ", location_lat=40.1, location_lng=69.2)
    assert request.description == "Need help"

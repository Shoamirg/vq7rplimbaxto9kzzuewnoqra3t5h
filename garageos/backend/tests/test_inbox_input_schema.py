"""HTTP input model contracts; no server, database or auth substitute is used.

Owning route/transaction behavior is separately verified by real-PG API tests.
"""
import pytest
from pydantic import ValidationError

from app.api.v1.endpoints.conversations import ConversationCreate, ConversationUpdate, ParticipantIn


@pytest.mark.parametrize('data', [
    {'conv_type': 'invalid'}, {'priority': 'invalid'}, {'subject': 'x'*201},
    {'subject': '   '}, {'ai_summary': 'x'*201}, {'service_center_id': 'client-supplied'},
    {'participants': [{'role': 'invalid', 'display_name': 'Recorded participant'}]},
    {'participants': [{'role': 'watcher', 'display_name': 'x'*121}]},
    {'participants': [{'role': 'watcher', 'display_name': '   '}]},
])
def test_creation_rejects_invalid_shape_before_service(data):
    with pytest.raises(ValidationError):
        ConversationCreate.model_validate(data)


@pytest.mark.parametrize('data', [{'status': 'invalid'}, {'status': None},
    {'unread_messages': 0}, {'service_center_id': 'client-supplied'}])
def test_patch_rejects_invalid_status_and_client_counter_fields(data):
    with pytest.raises(ValidationError):
        ConversationUpdate.model_validate(data)


def test_patch_distinguishes_omitted_assignment_from_explicit_clear():
    omitted, clear = ConversationUpdate.model_validate({}), ConversationUpdate.model_validate({'assigned_user_id': None})
    assert 'assigned_user_id' not in omitted.model_fields_set
    assert 'assigned_user_id' in clear.model_fields_set and clear.assigned_user_id is None


def test_valid_stored_text_keeps_meaningful_whitespace():
    created = ConversationCreate.model_validate({'subject': '  Recorded subject  ',
        'participants': [{'role': 'customer', 'display_name': '  Captured name  '}]})
    assert created.subject == '  Recorded subject  '
    assert created.participants[0].display_name == '  Captured name  '


@pytest.mark.parametrize('data', [
    {'role': 'customer', 'display_name': 'Snapshot', 'user_id': '00000000-0000-0000-0000-000000000001'},
    {'role': 'watcher', 'display_name': 'Snapshot', 'customer_id': '00000000-0000-0000-0000-000000000001'},
])
def test_participant_identity_namespaces_are_explicit(data):
    with pytest.raises(ValidationError):
        ParticipantIn.model_validate(data)

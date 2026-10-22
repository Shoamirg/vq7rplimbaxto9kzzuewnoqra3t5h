"""Add a local customer conversation to the guarded browser QA fixture."""
import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.database import async_session_factory, engine
from app.models import Customer
from app.models.conversation import Conversation, Message


async def prepare() -> None:
    url = make_url(settings.DATABASE_URL)
    fixture_path = Path(os.environ['GARAGEOS_BROWSER_FIXTURE']).resolve()
    fixture = json.loads(fixture_path.read_text())
    if (settings.ENVIRONMENT != 'test' or settings.DEBUG
            or url.host not in {'localhost', '127.0.0.1'} or url.database != 'garage_test'
            or not fixture.get('qa_only') or fixture['base_origin'] != os.environ.get('BASE_URL')
            or fixture_path.is_relative_to(Path(__file__).resolve().parents[4])):
        raise ValueError('Use the isolated, private browser QA fixture')
    async with async_session_factory() as session:
        customer = await session.get(Customer, uuid.UUID(fixture['customer_id']))
        if customer is None or str(customer.service_center_id) != fixture['service_center_id']:
            raise ValueError('Synthetic customer identity mismatch')
        thread = await session.scalar(select(Conversation).where(
            Conversation.customer_id == customer.id, Conversation.subject == 'Design QA inspection'))
        if thread is None:
            now = datetime.now(timezone.utc)
            thread = Conversation(service_center_id=customer.service_center_id,
                customer_id=customer.id, subject='Design QA inspection',
                last_channel='web', last_message_at=now, last_activity_at=now,
                last_message_preview='Thank you. I will review the inspection.',
                last_sender_role='customer')
            session.add(thread)
            await session.flush()
            for role, body in [('dispatcher', 'Your inspection is ready.'),
                               ('customer', 'Thank you. I will review the inspection.')]:
                session.add(Message(service_center_id=customer.service_center_id,
                    conversation_id=thread.id, author_role=role,
                    author_name='Synthetic QA', body=body, channel='web'))
            await session.commit()
        fixture['design_conversation_id'] = str(thread.id)
    fixture_path.write_text(json.dumps(fixture), encoding='utf-8')
    await engine.dispose()
    print('Local design conversation fixture ready')


if __name__ == '__main__':
    asyncio.run(prepare())

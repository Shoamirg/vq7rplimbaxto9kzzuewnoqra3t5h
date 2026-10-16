"""Seed the Unified Inbox so the work queues are alive on first load.

Live threads flow from the API/EventBus at runtime; this backfills a plausible
inbox — mixed channels, statuses ("why is this open?"), priorities and AI chips —
tied to real customers/vehicles, with multi-participant messages, meaningful
attachments and pinned notes. One thread is linked to a live emergency case so
the SLA + case pill render end-to-end.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models import ServiceCenter
from app.models.conversation import (
    Attachment,
    Conversation,
    ConvStatus,
    ConvType,
    Message,
    MessageKind,
    Participant,
    ParticipantRole,
)
from app.models.operational_case import CaseType, OperationalCase

_NOW = datetime.now(timezone.utc)

# subject, type, status, priority, channel, ai_summary, mins_ago, pinned, thread, link_emergency
_THREADS = [
    ("Battery won't start", ConvType.EMERGENCY, ConvStatus.OPEN, "high", "telegram",
     "Battery likely · 81%", 2,
     ["Gate code 5829", "Use rear entrance", "Prefers Carlos"],
     [("customer", "telegram", "My car won't start 😩 I'm stuck on the way to work.", None),
      ("dispatcher", "telegram", "Hi — sorry to hear that. Can you share your location and a photo of the dashboard?", None),
      ("customer", "telegram", None, ("photo", "Dashboard warning lights")),
      ("customer", "telegram", None, ("location", "Live location — Samarqand Road")),
      ("dispatcher", "telegram", "Thanks! Looks like a discharged battery — Carlos is on his way, ETA 8 min. 🚗", None),
      ("mechanic", "internal", "On it 👍 8 minutes out. Bringing a jump pack + spare battery.", None)],
     True),
    ("Accident — sent dashboard photo", ConvType.EMERGENCY, ConvStatus.OPEN, "high", "telegram",
     "Collision · escalate", 4, None,
     [("customer", "telegram", "I've had an accident, everyone's safe but the car won't drive.", None),
      ("customer", "telegram", None, ("photo", "Front-end damage"))],
     False),
    ("Reschedule Thursday service", ConvType.SUPPORT, ConvStatus.OPEN, "medium", "web",
     "Offer AM slot 9:30", 6, None,
     [("customer", "web", "Can I move my Thursday service to the morning?", None)],
     False),
    ("Is the brake labour covered?", ConvType.WARRANTY, ConvStatus.WAITING_APPROVAL, "medium", "email",
     "Warranty: yes, in-policy", 14, None,
     [("customer", "email", "Re: Invoice — is the brake labour covered under warranty?", None),
      ("dispatcher", "email", "Checking your policy now — back to you shortly.", None)],
     False),
    ("Oil service done — photos attached", ConvType.GENERAL, ConvStatus.WAITING_TECHNICIAN, "low", "internal",
     "Ready to invoice", 22, None,
     [("mechanic", "internal", "Finished the oil service on the CR-V — photos attached.", ("photo", "Completed oil service")),
      ("dispatcher", "internal", "Nice — @Manager ready to invoice when you approve.", None)],
     False),
    ("Estimate sent — $840", ConvType.SUPPORT, ConvStatus.WAITING_CUSTOMER, "low", "phone",
     "Follow up in 1h", 40, None,
     [("dispatcher", "phone", "Sent over the $840 estimate — let us know if you'd like to proceed.", None)],
     False),
    ("Passport link worked great", ConvType.GENERAL, ConvStatus.RESOLVED, "low", "web",
     None, 60, None,
     [("customer", "web", "Thanks! The passport link worked great 👍", None),
      ("dispatcher", "web", "Wonderful — glad it helped!", None)],
     False),
]


async def generate_conversations(session, center: ServiceCenter, vehicles, mechanics) -> int:
    pairs = [(v.customer_id, v.id) for v in (vehicles or []) if v.customer_id][:len(_THREADS)]
    if not pairs:
        return 0

    # Link the first thread to a live emergency case (SLA + case pill end-to-end).
    emergency_case = (await session.execute(
        select(OperationalCase).where(
            OperationalCase.service_center_id == center.id,
            OperationalCase.case_type == CaseType.EMERGENCY,
        ).limit(1)
    )).scalar_one_or_none()

    mech_name = mechanics[0].full_name if mechanics else "Carlos Mendez"
    disp_name = "You"
    created = 0

    for i, (subj, ctype, status, prio, channel, ai, mins, pins, thread, link_e) in enumerate(_THREADS):
        cust_id, veh_id = pairs[i % len(pairs)]
        base = _NOW - timedelta(minutes=mins)
        conv = Conversation(
            service_center_id=center.id, subject=subj, conv_type=ctype, status=status,
            priority=prio, customer_id=cust_id, vehicle_id=veh_id, ai_summary=ai,
            pinned_notes=pins, last_channel=channel,
            case_id=(emergency_case.id if (link_e and emergency_case) else None),
            created_at=base,
        )
        session.add(conv)
        await session.flush()

        # Participants — the cast on the thread.
        session.add_all([
            Participant(service_center_id=center.id, conversation_id=conv.id,
                        role=ParticipantRole.CUSTOMER, display_name="Customer", customer_id=cust_id),
            Participant(service_center_id=center.id, conversation_id=conv.id,
                        role=ParticipantRole.DISPATCHER, display_name=disp_name),
        ])
        if any(who == "mechanic" for who, *_ in thread):
            session.add(Participant(service_center_id=center.id, conversation_id=conv.id,
                                    role=ParticipantRole.MECHANIC, display_name=mech_name))

        last = base
        unread = 0
        last_role = None
        for j, (who, ch, body, attach) in enumerate(thread):
            when = base + timedelta(minutes=j)
            internal = ch == "internal"
            name = {"customer": "Customer", "dispatcher": disp_name, "mechanic": mech_name}.get(who, who)
            mentions = ["@Manager"] if (body and "@Manager" in body) else None
            msg = Message(
                service_center_id=center.id, conversation_id=conv.id,
                kind=MessageKind.NOTE if internal else MessageKind.TEXT,
                channel=("internal" if internal else ch), is_internal=internal,
                author_role=who, author_name=name, body=body, mentions=mentions,
                created_at=when,
            )
            session.add(msg)
            await session.flush()
            if attach:
                kind, label = attach
                session.add(Attachment(
                    service_center_id=center.id, message_id=msg.id, conversation_id=conv.id,
                    kind=kind, label=label,
                    meta=({"lat": 41.31, "lng": 69.28} if kind == "location" else None),
                ))
            last = when
            last_role = who
            if who == "customer" and not internal:
                unread += 1

        conv.last_message_at = last
        conv.last_activity_at = last
        conv.last_sender_role = last_role
        conv.unread_messages = unread if status != ConvStatus.RESOLVED else 0
        # A couple of threads have unseen *activity* (assignment/sign-off) with no new message.
        conv.unread_activity = 1 if status == ConvStatus.WAITING_TECHNICIAN else 0
        conv.message_generation = conv.unread_messages
        conv.activity_generation = conv.unread_activity
        conv.acknowledged_message_generation = conv.acknowledged_activity_generation = 0
        last_msg = thread[-1]
        conv.last_message_preview = (last_msg[2] or (last_msg[3][1] if last_msg[3] else ""))[:300] or None
        created += 1

    await session.flush()
    return created

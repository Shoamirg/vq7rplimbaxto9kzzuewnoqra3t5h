"""Network — a dealer group / brand network that owns several workshops.

The platform tree is Platform → Network → ServiceCenter. A workshop with no
network is independent. An *exclusive* network keeps the customers its workshops
register inside the network: those customers only ever see the network's own
workshops (see ``app.services.workshop_visibility``).
"""
from sqlalchemy import Boolean, String, false
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import BaseModelMixin


class Network(BaseModelMixin, Base):
    __tablename__ = "networks"

    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    is_exclusive: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false(), nullable=False)

    service_centers = relationship("ServiceCenter", back_populates="network", lazy="selectin")

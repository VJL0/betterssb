"""Instructor contact card and utility endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.models import ContactCard
from app.sample_data import CONTACT_CARD

router = APIRouter(tags=["Instructor & Utilities"])


@router.get(
    "/contactCard/retrieveData",
    summary="Instructor contact card",
    description="""
Retrieve contact information for a faculty member by their Banner ID.
Returns name, email, phone, and office location.

The `bannerId` is available from the `faculty` array in section search results.
""",
    response_model=ContactCard,
)
async def get_contact_card(
    bannerId: str = Query(..., description="Faculty Banner ID", examples=["912345678"]),
    termCode: str = Query(..., description="Term code", examples=["202536"]),
) -> ContactCard:
    return CONTACT_CARD


@router.get(
    "/selfServiceMenu/data",
    summary="Self-service menu data",
    description="Returns the self-service navigation menu payload (XML in real SSB, JSON here).",
)
async def self_service_menu() -> dict:
    return {
        "menuItems": [
            {"label": "Registration", "url": "/registration"},
            {"label": "Student Records", "url": "/studentRecords"},
            {"label": "Financial Aid", "url": "/financialAid"},
        ]
    }


@router.get(
    "/userPreference/fetchUsageTracking",
    summary="Usage tracking preferences",
    description="Returns the user's analytics / usage tracking preferences.",
)
async def fetch_usage_tracking() -> dict:
    return {"trackingEnabled": False, "analyticsOptIn": False}

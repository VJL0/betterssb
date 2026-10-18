"""Public class search results. Field names match Banner's JSON (camelCase over
the wire), so the web app and extension share one `SSBSection` type."""

from __future__ import annotations

from datetime import datetime

from pydantic import Field

from app.shared.schemas import BaseSchema


class CodeDescription(BaseSchema):
    code: str
    description: str


class Faculty(BaseSchema):
    banner_id: str = ""
    display_name: str = ""
    email_address: str | None = None
    primary_indicator: bool = False


class MeetingTime(BaseSchema):
    begin_time: str | None = None
    end_time: str | None = None
    building: str | None = None
    building_description: str | None = None
    campus: str | None = None
    campus_description: str | None = None
    room: str | None = None
    meeting_type: str | None = None
    meeting_type_description: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    monday: bool = False
    tuesday: bool = False
    wednesday: bool = False
    thursday: bool = False
    friday: bool = False
    saturday: bool = False
    sunday: bool = False


class MeetingFaculty(BaseSchema):
    meeting_time: MeetingTime


class ClassSection(BaseSchema):
    id: int
    term: str
    term_desc: str
    course_reference_number: str
    part_of_term: str = ""
    course_number: str
    subject: str
    subject_description: str = ""
    sequence_number: str = ""
    campus_description: str = ""
    schedule_type_description: str = ""
    course_title: str
    credit_hours: float | None = None
    credit_hour_low: float | None = None
    credit_hour_high: float | None = None
    maximum_enrollment: int = 0
    enrollment: int = 0
    seats_available: int = 0
    wait_capacity: int = 0
    wait_count: int = 0
    wait_available: int = 0
    open_section: bool = False
    subject_course: str
    instructional_method: str | None = None
    instructional_method_description: str | None = None
    is_section_linked: bool = False
    link_identifier: str | None = None
    faculty: list[Faculty] = Field(default_factory=list)
    meetings_faculty: list[MeetingFaculty] = Field(default_factory=list)
    section_attributes: list[CodeDescription] = Field(default_factory=list)


class ClassSearchResult(BaseSchema):
    total_count: int
    sections: list[ClassSection]
    fetched_at: datetime = Field(
        description="When Banner returned this data. Seats change."
    )

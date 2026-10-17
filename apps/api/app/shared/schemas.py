from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class BaseSchema(BaseModel):
    """Base model for camelCase API schemas."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        validate_by_name=True,
        validate_by_alias=True,
        serialize_by_alias=True,
        # Responses always include defaulted fields, so the response schema
        # marks them required and generated clients don't type them optional.
        json_schema_serialization_defaults_required=True,
    )

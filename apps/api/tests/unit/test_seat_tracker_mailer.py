from __future__ import annotations

import smtplib
from email.message import EmailMessage
from typing import ClassVar, Self

import pytest

from app.core.config import Settings
from app.modules.seat_tracker import mailer as mailer_module
from app.modules.seat_tracker.mailer import (
    Email,
    GmailMailer,
    LogMailer,
    MailError,
    create_mailer,
)

EMAIL = Email(to="student@gmail.com", subject="Seat open", text="1 seat is open.")


def settings(**overrides: str) -> Settings:
    return Settings(
        GOOGLE_CLIENT_ID="id",
        GOOGLE_CLIENT_SECRET="secret",
        SESSION_SECRET="s" * 32,
        **overrides,
    )


class FakeSmtp:
    """Stands in for smtplib.SMTP_SSL and records what it was asked to do."""

    instances: ClassVar[list[FakeSmtp]] = []
    login_error: ClassVar[Exception | None] = None

    def __init__(self, host: str, port: int, *, timeout: float) -> None:
        self.address = (host, port)
        self.logins: list[tuple[str, str]] = []
        self.sent: list[EmailMessage] = []
        FakeSmtp.instances.append(self)

    def __enter__(self) -> Self:
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def login(self, user: str, password: str) -> None:
        if FakeSmtp.login_error:
            raise FakeSmtp.login_error
        self.logins.append((user, password))

    def send_message(self, message: EmailMessage) -> None:
        self.sent.append(message)


@pytest.fixture()
def smtp(monkeypatch: pytest.MonkeyPatch) -> type[FakeSmtp]:
    FakeSmtp.instances = []
    FakeSmtp.login_error = None
    monkeypatch.setattr(mailer_module.smtplib, "SMTP_SSL", FakeSmtp)
    return FakeSmtp


def gmail() -> GmailMailer:
    return GmailMailer(
        host="smtp.gmail.com",
        port=465,
        username="alerts@gmail.com",
        password="app-password",
    )


class TestGmailMailer:
    async def test_signs_in_with_the_app_password_and_sends(self, smtp):
        await gmail().send(EMAIL)

        [server] = smtp.instances
        assert server.address == ("smtp.gmail.com", 465)
        assert server.logins == [("alerts@gmail.com", "app-password")]
        [message] = server.sent
        assert message["From"] == "BetterSSB <alerts@gmail.com>"
        assert message["To"] == "student@gmail.com"
        assert message["Subject"] == "Seat open"
        assert message.get_content().strip() == "1 seat is open."

    async def test_a_rejected_sign_in_is_a_mail_error(self, smtp):
        smtp.login_error = smtplib.SMTPAuthenticationError(535, b"bad credentials")
        with pytest.raises(MailError):
            await gmail().send(EMAIL)


class TestCreateMailer:
    def test_uses_gmail_with_an_app_password(self):
        mailer = create_mailer(
            settings(SMTP_USERNAME="alerts@gmail.com", SMTP_PASSWORD="app-password")
        )
        assert isinstance(mailer, GmailMailer)
        assert mailer.sender == "BetterSSB <alerts@gmail.com>"

    @pytest.mark.parametrize(
        ("environment", "expected"), [("development", LogMailer), ("production", None)]
    )
    def test_without_gmail_logs_in_development_only(self, environment, expected):
        mailer = create_mailer(
            settings(ENVIRONMENT=environment, SMTP_USERNAME="", SMTP_PASSWORD="")
        )
        assert mailer is None if expected is None else isinstance(mailer, expected)

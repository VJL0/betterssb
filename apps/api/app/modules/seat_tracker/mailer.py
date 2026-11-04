"""Seat-opening emails, sent from a Gmail account over SMTP.

Gmail takes an app password (Google Account → Security → App passwords) for
SMTP; the account's real password stopped working for SMTP in March 2025.
"""

from __future__ import annotations

import asyncio
import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

from app.core.config import Settings

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 15
SENDER_NAME = "BetterSSB"


class MailError(Exception):
    """The mail server didn't accept the message."""


@dataclass(frozen=True)
class Email:
    to: str
    subject: str
    text: str


class Mailer(Protocol):
    async def send(self, email: Email) -> None: ...


class GmailMailer:
    """Sends over implicit TLS, as Gmail's smtp.gmail.com:465 expects."""

    def __init__(self, *, host: str, port: int, username: str, password: str) -> None:
        self._host = host
        self._port = port
        self._username = username
        self._password = password

    @property
    def sender(self) -> str:
        return f"{SENDER_NAME} <{self._username}>"

    async def send(self, email: Email) -> None:
        # smtplib blocks, so it runs off the event loop.
        try:
            await asyncio.to_thread(self._send, self._message(email))
        except (smtplib.SMTPException, OSError) as exc:
            raise MailError(str(exc)) from exc

    def _message(self, email: Email) -> EmailMessage:
        message = EmailMessage()
        message["From"] = self.sender
        message["To"] = email.to
        message["Subject"] = email.subject
        message.set_content(email.text)
        return message

    def _send(self, message: EmailMessage) -> None:
        with smtplib.SMTP_SSL(
            self._host, self._port, timeout=SMTP_TIMEOUT_SECONDS
        ) as smtp:
            smtp.login(self._username, self._password)
            smtp.send_message(message)


class LogMailer:
    """Development without Gmail credentials: the email goes to the log."""

    async def send(self, email: Email) -> None:
        logger.info("Seat email to %s: %s\n%s", email.to, email.subject, email.text)


def create_mailer(settings: Settings) -> Mailer | None:
    """Gmail when configured, the log in development, otherwise none."""
    if settings.SMTP_USERNAME and settings.SMTP_PASSWORD:
        return GmailMailer(
            host=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USERNAME,
            password=settings.SMTP_PASSWORD,
        )
    if settings.ENVIRONMENT == "development":
        return LogMailer()
    return None

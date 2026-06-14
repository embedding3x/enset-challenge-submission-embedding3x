"""
Kafka event bus for the Agent Gateway.

Publishes interaction/progress events consumed by tp-service for teacher
analytics. The bus is strictly fire-and-forget: if the broker is down the
student-facing request path is never blocked or failed.

Topics (created on startup if missing):
  agent.interactions  — one event per agent call (explain / hint / quiz / evaluate)
  progress.updates    — student progress snapshots
  quiz.completed      — final quiz scores
"""
import asyncio
import json
import os
from datetime import datetime, timezone

from aiokafka import AIOKafkaProducer
from aiokafka.admin import AIOKafkaAdminClient, NewTopic
from aiokafka.errors import TopicAlreadyExistsError, KafkaError

KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:29092")

TOPIC_INTERACTIONS = "agent.interactions"
TOPIC_PROGRESS = "progress.updates"
TOPIC_QUIZ_COMPLETED = "quiz.completed"

# topic -> retention.ms (interactions/progress 7 days, quiz results 30 days)
_TOPIC_SPECS = {
    TOPIC_INTERACTIONS: 7 * 86_400_000,
    TOPIC_PROGRESS: 7 * 86_400_000,
    TOPIC_QUIZ_COMPLETED: 30 * 86_400_000,
}


class EventBus:
    def __init__(self) -> None:
        self._producer: AIOKafkaProducer | None = None
        self.ready = False

    async def start(self) -> None:
        try:
            await self._ensure_topics()
            producer = AIOKafkaProducer(
                bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v, ensure_ascii=False).encode(),
                key_serializer=lambda k: k.encode() if k else None,
                request_timeout_ms=5000,
            )
            await producer.start()
            self._producer = producer
            self.ready = True
            print(f"[agent-gateway] Kafka producer connected ({KAFKA_BOOTSTRAP_SERVERS})")
        except Exception as e:  # noqa: BLE001
            self.ready = False
            print(f"[agent-gateway] Kafka unavailable, events disabled: {e}")

    async def stop(self) -> None:
        if self._producer:
            try:
                await self._producer.stop()
            except Exception:  # noqa: BLE001
                pass
        self._producer = None
        self.ready = False

    async def _ensure_topics(self) -> None:
        admin = AIOKafkaAdminClient(bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS)
        await admin.start()
        try:
            new_topics = [
                NewTopic(
                    name=name,
                    num_partitions=3,
                    replication_factor=1,
                    topic_configs={"retention.ms": str(retention)},
                )
                for name, retention in _TOPIC_SPECS.items()
            ]
            try:
                await admin.create_topics(new_topics)
            except TopicAlreadyExistsError:
                pass
        finally:
            await admin.close()

    async def emit(self, topic: str, event: dict, key: str | None = None) -> None:
        """Fire-and-forget publish; never raises into the request path."""
        if not self.ready or self._producer is None:
            return
        event.setdefault("at", datetime.now(timezone.utc).isoformat())
        try:
            await self._producer.send(topic, value=event, key=key)
        except KafkaError as e:
            print(f"[agent-gateway] Kafka emit failed on {topic}: {e}")
        except Exception as e:  # noqa: BLE001
            print(f"[agent-gateway] Kafka emit error on {topic}: {e}")


bus = EventBus()


async def emit_interaction(kind: str, agent: str, session_id: str | None, detail: dict) -> None:
    await bus.emit(
        TOPIC_INTERACTIONS,
        {"type": kind, "agent": agent, "sessionId": session_id, **detail},
        key=session_id,
    )

package enset.embedding3x.tpservice.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

/**
 * One Kafka event consumed from the agentic layer
 * (agent.interactions · progress.updates · quiz.completed).
 * Feeds the teacher analytics dashboard.
 */
@Entity
@Table(name = "agent_events", indexes = {
        @Index(name = "idx_agent_events_topic", columnList = "topic"),
        @Index(name = "idx_agent_events_session", columnList = "session_id")
})
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentEvent {

    @Id
    private String id;

    @Column(nullable = false)
    private String topic;

    /** Event type inside the topic, e.g. hint, explain, evaluate, progress. */
    private String type;

    @Column(name = "session_id")
    private String sessionId;

    @Column(name = "tp_id")
    private String tpId;

    /** Raw event JSON as published by the agent gateway. */
    @Column(name = "payload_json", columnDefinition = "TEXT")
    private String payloadJson;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime receivedAt;
}

package enset.embedding3x.tpservice.kafka;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import enset.embedding3x.tpservice.entity.AgentEvent;
import enset.embedding3x.tpservice.repository.AgentEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

import java.util.UUID;

/**
 * Consumes the async event pipeline published by the agent gateway and
 * persists each event into tp_db for teacher analytics.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class AgentEventListener {

    private final AgentEventRepository repository;
    private final ObjectMapper mapper = new ObjectMapper();

    @KafkaListener(
            topics = {"agent.interactions", "progress.updates", "quiz.completed"},
            groupId = "${spring.kafka.consumer.group-id:agentic-tp-group}"
    )
    public void onEvent(ConsumerRecord<String, String> record) {
        try {
            JsonNode json = mapper.readTree(record.value());
            AgentEvent event = AgentEvent.builder()
                    .id(UUID.randomUUID().toString())
                    .topic(record.topic())
                    .type(json.path("type").asText(null))
                    .sessionId(json.path("sessionId").asText(null))
                    .tpId(json.path("tpId").asText(null))
                    .payloadJson(record.value())
                    .build();
            repository.save(event);
            log.debug("Stored agent event {} from topic {}", event.getId(), record.topic());
        } catch (Exception e) {
            // Never let a malformed event poison the consumer loop.
            log.warn("Failed to persist agent event from topic {}: {}", record.topic(), e.getMessage());
        }
    }
}

package enset.embedding3x.tpservice.controller;

import enset.embedding3x.tpservice.entity.AgentEvent;
import enset.embedding3x.tpservice.repository.AgentEventRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Read API over the Kafka-fed agent_events table (teacher dashboard analytics).
 */
@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final AgentEventRepository repository;

    @GetMapping("/events")
    public List<AgentEvent> latestEvents(@RequestParam(required = false) String topic) {
        return topic == null
                ? repository.findTop100ByOrderByReceivedAtDesc()
                : repository.findTop100ByTopicOrderByReceivedAtDesc(topic);
    }

    @GetMapping("/events/session/{sessionId}")
    public List<AgentEvent> sessionEvents(@PathVariable String sessionId) {
        return repository.findBySessionIdOrderByReceivedAtAsc(sessionId);
    }

    @GetMapping("/summary")
    public Map<String, Long> summary() {
        return Map.of(
                "interactions", repository.countByTopic("agent.interactions"),
                "progressUpdates", repository.countByTopic("progress.updates"),
                "quizzesCompleted", repository.countByTopic("quiz.completed")
        );
    }
}

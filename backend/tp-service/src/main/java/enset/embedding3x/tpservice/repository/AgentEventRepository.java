package enset.embedding3x.tpservice.repository;

import enset.embedding3x.tpservice.entity.AgentEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AgentEventRepository extends JpaRepository<AgentEvent, String> {

    List<AgentEvent> findTop100ByOrderByReceivedAtDesc();

    List<AgentEvent> findTop100ByTopicOrderByReceivedAtDesc(String topic);

    List<AgentEvent> findBySessionIdOrderByReceivedAtAsc(String sessionId);

    long countByTopic(String topic);
}

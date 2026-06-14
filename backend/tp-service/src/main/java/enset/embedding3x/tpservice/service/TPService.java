package enset.embedding3x.tpservice.service;

import enset.embedding3x.tpservice.entity.TP;
import enset.embedding3x.tpservice.repository.TPRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class TPService {

    private final TPRepository tpRepository;

    public List<TP> findAll() {
        return tpRepository.findAll();
    }

    public List<TP> findByCreatedBy(String userId) {
        return tpRepository.findByCreatedByOrderByCreatedAtDesc(userId);
    }

    public TP findById(String id) {
        return tpRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("TP not found: " + id));
    }

    public TP create(Map<String, Object> data, String createdBy) {
        TP tp = TP.builder()
                .id(data.get("id") != null ? (String) data.get("id") : java.util.UUID.randomUUID().toString())
                .title((String) data.get("title"))
                .description((String) data.getOrDefault("description", ""))
                .difficulty((String) data.getOrDefault("difficulty", "beginner"))
                .field((String) data.getOrDefault("field", "Général"))
                .estimatedMinutes(data.get("estimatedMinutes") != null
                        ? ((Number) data.get("estimatedMinutes")).intValue() : 30)
                .starterHTML((String) data.getOrDefault("starterHTML", ""))
                .language((String) data.getOrDefault("language", "html"))
                .status((String) data.getOrDefault("status", "published"))
                .content(castMap(data.get("content")))
                .antiCheat(data.get("antiCheat") instanceof Boolean b ? b : Boolean.TRUE)
                .steps(castStepsList(data.get("steps")))
                .createdBy(createdBy)
                .build();
        return tpRepository.save(tp);
    }

    public TP update(String id, Map<String, Object> data, String requestingUserId) {
        TP tp = findById(id);
        if (!tp.getCreatedBy().equals(requestingUserId)) {
            throw new SecurityException("Not authorized to update this TP");
        }
        if (data.containsKey("title")) tp.setTitle((String) data.get("title"));
        if (data.containsKey("description")) tp.setDescription((String) data.get("description"));
        if (data.containsKey("difficulty")) tp.setDifficulty((String) data.get("difficulty"));
        if (data.containsKey("field")) tp.setField((String) data.get("field"));
        if (data.containsKey("estimatedMinutes"))
            tp.setEstimatedMinutes(((Number) data.get("estimatedMinutes")).intValue());
        if (data.containsKey("starterHTML")) tp.setStarterHTML((String) data.get("starterHTML"));
        if (data.containsKey("language")) tp.setLanguage((String) data.get("language"));
        if (data.containsKey("status")) tp.setStatus((String) data.get("status"));
        if (data.containsKey("content")) tp.setContent(castMap(data.get("content")));
        if (data.get("antiCheat") instanceof Boolean b) tp.setAntiCheat(b);
        if (data.containsKey("steps")) tp.setSteps(castStepsList(data.get("steps")));
        return tpRepository.save(tp);
    }

    public void delete(String id, String requestingUserId) {
        TP tp = findById(id);
        if (!tp.getCreatedBy().equals(requestingUserId)) {
            throw new SecurityException("Not authorized to delete this TP");
        }
        tpRepository.deleteById(id);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> castStepsList(Object steps) {
        if (steps == null) return List.of();
        if (steps instanceof List<?> list) {
            return (List<Map<String, Object>>) list;
        }
        return List.of();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> castMap(Object value) {
        if (value instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return new java.util.HashMap<>();
    }
}

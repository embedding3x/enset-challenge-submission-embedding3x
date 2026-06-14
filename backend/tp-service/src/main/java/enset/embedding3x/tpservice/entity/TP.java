package enset.embedding3x.tpservice.entity;

import enset.embedding3x.tpservice.converter.JsonConverter;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "tps")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TP {

    @Id
    private String id;

    @Column(nullable = false)
    private String title;

    @Column(columnDefinition = "TEXT")
    private String description;

    private String difficulty;

    private String field;

    private Integer estimatedMinutes;

    @Column(columnDefinition = "TEXT")
    private String starterHTML;

    /** Primary language of the TP (html, css, javascript, python…). */
    @Builder.Default
    private String language = "html";

    /**
     * Human-in-the-Loop lifecycle status:
     * draft → reviewed → enhanced → published.
     */
    @Builder.Default
    private String status = "published";

    /**
     * Structured, university-level sections (context, objectives, prerequisites,
     * tools, expectedOutput, constraints, evaluationCriteria, bonus). Stored as
     * JSON so adding sections needs no schema migration.
     */
    @Convert(converter = JsonConverter.MapConverter.class)
    @Column(name = "content_json", columnDefinition = "TEXT")
    @Builder.Default
    private Map<String, Object> content = new java.util.HashMap<>();

    /** Teacher setting: block paste/drop in the student editor. */
    @Builder.Default
    private Boolean antiCheat = true;

    /**
     * JSON array of step objects matching frontend TPStep type:
     * [{id, title, instructions, requiredTags: string[], quiz: QuizQuestion[]}]
     */
    @Convert(converter = JsonConverter.MapListConverter.class)
    @Column(name = "steps_json", columnDefinition = "TEXT")
    @Builder.Default
    private List<Map<String, Object>> steps = new ArrayList<>();

    @Column(nullable = false)
    private String createdBy;

    @CreationTimestamp
    @Column(updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    private LocalDateTime updatedAt;
}

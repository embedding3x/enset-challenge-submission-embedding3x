package enset.embedding3x.tpservice.repository;

import enset.embedding3x.tpservice.entity.Assignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AssignmentRepository extends JpaRepository<Assignment, String> {
    List<Assignment> findByAssignedBy(String assignedBy);
    List<Assignment> findByTpId(String tpId);

    // Native query: studentIds is stored as a JSON array string (student_ids_json),
    // so we match the quoted id inside it. JPQL LIKE cannot be used here because
    // Hibernate applies the List<String> attribute converter to the parameter.
    @Query(value = "SELECT * FROM assignments WHERE student_ids_json LIKE '%\"' || :studentId || '\"%'",
           nativeQuery = true)
    List<Assignment> findByStudentIdContaining(@Param("studentId") String studentId);
}

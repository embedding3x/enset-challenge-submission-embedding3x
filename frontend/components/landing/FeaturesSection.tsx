import {
  Bot,
  BrainCircuit,
  Code2,
  FileCheck,
  Shield,
  Users,
} from "lucide-react";

const features = [
  {
    icon: Bot,
    title: "AI Lab Assistants",
    description:
      "Autonomous agents guide students through each practical step, providing hints without giving away answers.",
  },
  {
    icon: BrainCircuit,
    title: "Adaptive Difficulty",
    description:
      "The platform adjusts exercise complexity in real-time based on student performance and learning pace.",
  },
  {
    icon: Code2,
    title: "Live Code Evaluation",
    description:
      "Instant feedback on code submissions with intelligent error analysis and improvement suggestions.",
  },
  {
    icon: FileCheck,
    title: "Auto-Grading",
    description:
      "AI-powered automated grading with detailed rubrics, freeing instructors to focus on mentoring.",
  },
  {
    icon: Users,
    title: "Collaborative Labs",
    description:
      "Real-time collaborative workspaces where students can pair-program with AI-mediated support.",
  },
  {
    icon: Shield,
    title: "Plagiarism Detection",
    description:
      "Advanced AI detection ensures academic integrity while encouraging genuine learning.",
  },
];

export default function FeaturesSection() {
  return (
    <section id="features" className="py-24 px-6 bg-paneldark">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-secondary uppercase tracking-wider mb-3">
            Features
          </p>
          <h2 className="font-serif text-4xl md:text-5xl font-semibold text-white mb-4">
            Everything You Need for{" "}
            <span className="text-gradient">Smart TPs</span>
          </h2>
          <p className="text-textmuted text-lg max-w-2xl mx-auto">
            A complete toolkit that empowers educators and engages students through intelligent automation.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group glass-card p-6 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-xl bg-navactive border border-white/10 flex items-center justify-center mb-4 group-hover:bg-primary/15 transition-colors">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-textmuted leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

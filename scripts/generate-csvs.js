import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SUBJECTS = [
  'biology', 'chemistry', 'physics', 'maths', 
  'psychology', 'business', 'economics', 'english'
];

const BOARDS = ['aqa', 'edexcel', 'ocr'];

// Sample topic structures for each subject
const SUBJECT_TOPICS = {
  biology: [
    { name: 'Biological Molecules', topics: ['Water', 'Carbohydrates', 'Lipids', 'Proteins', 'Nucleic Acids'] },
    { name: 'Cells', topics: ['Cell Structure', 'Cell Membranes', 'Cell Division'] },
    { name: 'Genetics', topics: ['DNA Structure', 'Protein Synthesis', 'Inheritance'] },
    { name: 'Ecology', topics: ['Ecosystems', 'Biodiversity', 'Conservation'] }
  ],
  chemistry: [
    { name: 'Atomic Structure', topics: ['Fundamental Particles', 'Electronic Configuration', 'Ionisation Energy'] },
    { name: 'Bonding', topics: ['Ionic Bonding', 'Covalent Bonding', 'Metallic Bonding'] },
    { name: 'Organic Chemistry', topics: ['Alkanes', 'Alkenes', 'Alcohols', 'Carboxylic Acids'] },
    { name: 'Energetics', topics: ['Enthalpy Changes', 'Hess Law', 'Bond Enthalpies'] }
  ],
  physics: [
    { name: 'Mechanics', topics: ['Kinematics', 'Dynamics', 'Energy', 'Momentum'] },
    { name: 'Waves', topics: ['Properties of Waves', 'Sound Waves', 'Light Waves', 'Interference'] },
    { name: 'Electricity', topics: ['Current and Voltage', 'Resistance', 'Circuits', 'Electromagnetic Induction'] },
    { name: 'Particle Physics', topics: ['Particles and Antiparticles', 'Quarks', 'Leptons', 'Forces'] }
  ],
  maths: [
    { name: 'Algebra', topics: ['Quadratics', 'Polynomials', 'Sequences', 'Functions'] },
    { name: 'Calculus', topics: ['Differentiation', 'Integration', 'Applications'] },
    { name: 'Statistics', topics: ['Data Presentation', 'Probability', 'Hypothesis Testing'] },
    { name: 'Geometry', topics: ['Coordinate Geometry', 'Trigonometry', 'Vectors'] }
  ],
  psychology: [
    { name: 'Approaches', topics: ['Behaviourist', 'Cognitive', 'Biological', 'Psychodynamic'] },
    { name: 'Research Methods', topics: ['Experiments', 'Observations', 'Correlations', 'Case Studies'] },
    { name: 'Memory', topics: ['Multi-Store Model', 'Working Memory', 'Forgetting'] },
    { name: 'Social Influence', topics: ['Conformity', 'Obedience', 'Minority Influence'] }
  ],
  business: [
    { name: 'Marketing', topics: ['Market Research', 'Product Life Cycle', 'Pricing Strategies'] },
    { name: 'Finance', topics: ['Sources of Finance', 'Cash Flow', 'Break-Even Analysis'] },
    { name: 'Operations', topics: ['Production Methods', 'Quality', 'Supply Chain'] },
    { name: 'Human Resources', topics: ['Recruitment', 'Training', 'Motivation'] }
  ],
  economics: [
    { name: 'Microeconomics', topics: ['Supply and Demand', 'Market Structures', 'Market Failure'] },
    { name: 'Macroeconomics', topics: ['Economic Growth', 'Inflation', 'Unemployment'] },
    { name: 'International Economics', topics: ['Trade', 'Exchange Rates', 'Globalisation'] },
    { name: 'Government Policy', topics: ['Fiscal Policy', 'Monetary Policy', 'Supply-Side Policies'] }
  ],
  english: [
    { name: 'Poetry', topics: ['Form and Structure', 'Language Analysis', 'Context', 'Themes'] },
    { name: 'Prose', topics: ['Narrative Techniques', 'Characterisation', 'Setting', 'Symbolism'] },
    { name: 'Drama', topics: ['Stagecraft', 'Dialogue', 'Dramatic Irony', 'Tragedy'] },
    { name: 'Critical Analysis', topics: ['Literary Criticism', 'Comparative Analysis', 'Contextual Analysis'] }
  ]
};

function generateCSV(subject, board) {
  const topics = SUBJECT_TOPICS[subject];
  const rows = [];
  let topicId = 1;

  // Add header
  rows.push('topic_id,parent_id,name,level,duration_minutes');

  // Generate topics
  topics.forEach((level1Topic, level1Index) => {
    const level1Id = `${subject}-${String(topicId).padStart(3, '0')}`;
    rows.push(`${level1Id},,${level1Topic.name},1,30`);
    topicId++;

    level1Topic.topics.forEach((level2Topic, level2Index) => {
      const level2Id = `${subject}-${String(topicId).padStart(3, '0')}`;
      rows.push(`${level2Id},${level1Id},${level2Topic},2,30`);
      topicId++;

      // Add some level 3 topics
      const level3Topics = [
        `${level2Topic} - Basics`,
        `${level2Topic} - Applications`,
        `${level2Topic} - Advanced`
      ];

      level3Topics.forEach(level3Topic => {
        const level3Id = `${subject}-${String(topicId).padStart(3, '0')}`;
        rows.push(`${level3Id},${level2Id},${level3Topic},3,30`);
        topicId++;
      });
    });
  });

  return rows.join('\n');
}

function generateAllCSVs() {
  const dataDir = path.join(__dirname, '..', 'data', 'specs');
  
  // Ensure directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  let totalFiles = 0;

  SUBJECTS.forEach(subject => {
    BOARDS.forEach(board => {
      const filename = `${subject}_${board}.csv`;
      const filepath = path.join(dataDir, filename);
      
      const csvContent = generateCSV(subject, board);
      fs.writeFileSync(filepath, csvContent);
      
      console.log(`Generated ${filename} (${csvContent.split('\n').length - 1} topics)`);
      totalFiles++;
    });
  });

  console.log(`\nGenerated ${totalFiles} CSV files successfully!`);
  console.log(`Total topics across all files: ${totalFiles * 40} (estimated)`);
}

// Run the generation
generateAllCSVs();



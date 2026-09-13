import { storage } from "./storage";

async function seedDatabase() {
  console.log('Starting database population...');
  
  // Sample companies
  const companies = [
    {
      name: 'TechnoForge Industries',
      description: 'Leading manufacturer of precision CNC machines and automated manufacturing solutions for aerospace and automotive industries.',
      industry: 'Manufacturing Equipment',
      location: 'Detroit, Michigan',
      phone: '+1 (313) 555-0123',
      email: 'contact@technoforge.com',
      contactEmail: 'sales@technoforge.com',
      website: 'https://technoforge.com',
      employeeCount: '500-1000',
      foundedYear: 1985,
      colorTheme: 'blue',
      certifications: ['ISO 9001', 'AS9100', 'IATF 16949'],
      capabilities: ['CNC Machining', 'Automated Assembly', 'Quality Control Systems', 'Custom Tooling'],
      isActive: true
    },
    {
      name: 'RoboTech Solutions',
      description: 'Industrial robotics and automation systems specialist providing complete factory automation solutions.',
      industry: 'Robotics & Automation',
      location: 'Boston, Massachusetts',
      phone: '+1 (617) 555-0456',
      email: 'info@robotechsolutions.com',
      contactEmail: 'sales@robotechsolutions.com',
      website: 'https://robotechsolutions.com',
      employeeCount: '200-500',
      foundedYear: 1992,
      colorTheme: 'green',
      certifications: ['ISO 9001', 'CE Marking', 'UL Listed'],
      capabilities: ['Industrial Robotics', 'Process Automation', 'Vision Systems', 'PLC Programming'],
      isActive: true
    },
    {
      name: 'DeepFolder',
      description: 'Advanced AI-powered manufacturing solutions for intelligent automation and predictive analytics in industrial environments.',
      industry: 'AI & Manufacturing Technology',
      location: 'San Jose, California',
      phone: '+1 (408) 555-0789',
      email: 'contact@deepfolder.com',
      contactEmail: 'sales@deepfolder.com',
      website: 'https://deepfolder.com',
      employeeCount: '100-200',
      foundedYear: 2020,
      colorTheme: 'purple',
      certifications: ['ISO 27001', 'SOC 2 Type II', 'GDPR Compliant'],
      capabilities: ['AI Integration', 'Predictive Analytics', 'Machine Learning', 'Industrial IoT'],
      isActive: true
    }
  ];

  const createdCompanies = [];
  for (const company of companies) {
    try {
      const created = await storage.createCompany(company);
      createdCompanies.push(created);
      console.log(`Created company: ${company.name}`);
    } catch (error) {
      console.log(`Company exists or error: ${company.name}`);
    }
  }

  // Sample products
  const products = [
    {
      companyId: 1,
      name: 'Precision CNC Machining Center',
      description: 'High-precision 5-axis CNC machining center for complex aerospace components with advanced control systems.',
      category: 'CNC Machines',
      modelPath: '/models/cnc-machine.stl',
      catalogPath: '/catalogs/cnc-catalog.pdf',
      modelType: 'stl',
      specifications: { 
        workArea: '500x400x300mm',
        spindle: '20000 RPM',
        accuracy: '±0.005mm',
        weight: '3500kg'
      },
      isActive: true
    },
    {
      companyId: 1,
      name: 'Quality Control Scanner',
      description: 'Advanced 3D optical measurement system for precision quality control and inspection.',
      category: 'Measurement Equipment',
      modelPath: '/models/scanner.stl',
      catalogPath: '/catalogs/scanner-catalog.pdf',
      modelType: 'stl',
      specifications: {
        accuracy: '±0.001mm',
        scanVolume: '200x200x150mm',
        scanSpeed: '2M points/sec',
        software: 'GOM Inspect'
      },
      isActive: true
    },
    {
      companyId: 2,
      name: 'Industrial Robot Arm',
      description: '6-DOF industrial robot arm for assembly, welding, and material handling applications.',
      category: 'Industrial Robots',
      modelPath: '/models/robot-arm.step',
      catalogPath: '/catalogs/robot-catalog.pdf',
      modelType: 'step',
      specifications: {
        payload: '10kg',
        reach: '1200mm',
        repeatability: '±0.1mm',
        speed: '7.5 m/s'
      },
      isActive: true
    },
    {
      companyId: 2,
      name: 'Automated Assembly Line',
      description: 'Complete automated assembly line system with conveyor belts, robots, and quality control.',
      category: 'Automation Systems',
      modelPath: '/models/assembly-line.step',
      catalogPath: '/catalogs/assembly-catalog.pdf',
      modelType: 'step',
      specifications: {
        throughput: '120 units/hour',
        stations: '8 assembly stations',
        footprint: '15x3 meters',
        power: '50kW'
      },
      isActive: true
    },
    {
      companyId: 3,
      name: 'AI Production Optimizer',
      description: 'Machine learning-powered optimization system for manufacturing processes, reducing waste and improving efficiency by up to 30%.',
      category: 'AI Software',
      modelPath: '/models/ai-optimizer.stl',
      catalogPath: '/catalogs/ai-optimizer-catalog.pdf',
      modelType: 'stl',
      specifications: {
        algorithms: 'Deep Learning, Reinforcement Learning',
        integrations: 'ERP, MES, SCADA Systems',
        realTimeAnalysis: 'Sub-second decision making',
        efficiency: 'Up to 30% improvement'
      },
      isActive: true
    },
    {
      companyId: 3,
      name: 'Predictive Maintenance Platform',
      description: 'AI-driven predictive maintenance solution using IoT sensors and machine learning to prevent equipment failures.',
      category: 'AI Analytics',
      modelPath: '/models/predictive-platform.stl',
      catalogPath: '/catalogs/predictive-maintenance-catalog.pdf',
      modelType: 'stl',
      specifications: {
        sensors: 'Vibration, Temperature, Pressure',
        accuracy: '95% failure prediction',
        downtime: 'Reduced by 60%',
        connectivity: 'WiFi, LoRaWAN, 5G'
      },
      isActive: true
    }
  ];

  for (const product of products) {
    try {
      await storage.createProduct(product);
      console.log(`Created product: ${product.name}`);
    } catch (error) {
      console.log(`Product exists or error: ${product.name}`);
    }
  }

  console.log('Database seeding completed successfully!');
}

seedDatabase().catch(console.error);
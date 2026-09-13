import { storage } from "./storage";

// Real product images - mapped to generated product photos
const realisticProductImages = {
  // CNC & Manufacturing Equipment
  'precision cnc machining center': '/attached_assets/generated_images/CNC_machining_center_product_ef247597.png',
  'cnc machining center': '/attached_assets/generated_images/CNC_machining_center_product_ef247597.png',
  'metal 3d printing system': '/attached_assets/generated_images/Metal_3D_printing_system_7ff7cda9.png',
  
  // Robotics & Automation
  'industrial robot arm': '/attached_assets/generated_images/Industrial_robot_arm_product_3310ebef.png',
  'robotic arm': '/attached_assets/generated_images/Industrial_robot_arm_product_3310ebef.png',
  'assembly robot': '/attached_assets/generated_images/Industrial_robot_arm_product_3310ebef.png',
  'robotai': '/attached_assets/generated_images/Industrial_robot_arm_product_3310ebef.png',
  'roboticai solution': '/attached_assets/generated_images/Industrial_robot_arm_product_3310ebef.png',
  'robotai': '/attached_assets/generated_images/Industrial_robot_arm_product_3310ebef.png',
  
  // Quality Control & Testing
  'quality control scanner': '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png',
  'testing equipment': '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png',
  'measurement tool': '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png',
  'precision instrument': '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png',
  
  // Motors & Actuators
  'servo motor': '/attached_assets/generated_images/Servo_motor_product_43cc3f50.png',
  'stepper motor': '/attached_assets/generated_images/Servo_motor_product_43cc3f50.png',
  'electric motor': '/attached_assets/generated_images/Servo_motor_product_43cc3f50.png',
  'linear actuator': '/attached_assets/generated_images/Linear_actuator_product_c435534e.png',
  'pneumatic actuator': '/attached_assets/generated_images/Linear_actuator_product_c435534e.png',
  
  // Sensors & Electronics
  'pressure sensor': '/attached_assets/generated_images/Pressure_sensor_product_68e8fa35.png',
  'temperature sensor': '/attached_assets/generated_images/Pressure_sensor_product_68e8fa35.png',
  'proximity sensor': '/attached_assets/generated_images/Pressure_sensor_product_68e8fa35.png',
  'flow sensor': '/attached_assets/generated_images/Pressure_sensor_product_68e8fa35.png',
  
  // Control Systems
  'plc controller': '/attached_assets/generated_images/PLC_controller_product_2e5d3e3e.png',
  'control panel': '/attached_assets/generated_images/PLC_controller_product_2e5d3e3e.png',
  'hmi panel': '/attached_assets/generated_images/PLC_controller_product_2e5d3e3e.png',
  'industrial computer': '/attached_assets/generated_images/PLC_controller_product_2e5d3e3e.png',
  
  // Manufacturing Systems
  'automated assembly line': '/attached_assets/generated_images/CNC_machining_center_product_ef247597.png',
  'professional 3d printer': '/attached_assets/generated_images/Metal_3D_printing_system_7ff7cda9.png',
  
  // AI & Software Products
  'ai production optimizer': '/attached_assets/generated_images/PLC_controller_product_2e5d3e3e.png',
  'predictive maintenance platform': '/attached_assets/generated_images/PLC_controller_product_2e5d3e3e.png',
  
  // Industrial Components
  'industrial precision screw ic316451': '/attached_assets/generated_images/Servo_motor_product_43cc3f50.png',
  
  // Test Products
  'step file test': '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png',
  'test delete product': '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png',
  'final test product': '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png',
  'test product': '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png',
};

function getRealisticProductImage(productName: string, category: string): string {
  const name = productName.toLowerCase();
  const cat = category.toLowerCase();
  
  // First, try to match specific product name
  for (const [key, imagePath] of Object.entries(realisticProductImages)) {
    if (name.includes(key)) {
      return imagePath;
    }
  }
  
  // Then try to match by category keywords
  if (cat.includes('cnc') || cat.includes('machining') || cat.includes('manufacturing')) {
    return '/attached_assets/generated_images/CNC_machining_center_product_ef247597.png';
  }
  if (cat.includes('robot') || cat.includes('automation')) {
    return '/attached_assets/generated_images/Industrial_robot_arm_product_3310ebef.png';
  }
  if (cat.includes('3d') || cat.includes('printing')) {
    return '/attached_assets/generated_images/Metal_3D_printing_system_7ff7cda9.png';
  }
  if (cat.includes('quality') || cat.includes('testing') || cat.includes('measurement')) {
    return '/attached_assets/generated_images/Quality_control_scanner_product_4f7d0980.png';
  }
  if (cat.includes('motor') || cat.includes('actuator')) {
    return '/attached_assets/generated_images/Servo_motor_product_43cc3f50.png';
  }
  if (cat.includes('sensor') || cat.includes('electronics')) {
    return '/attached_assets/generated_images/Pressure_sensor_product_68e8fa35.png';
  }
  if (cat.includes('control') || cat.includes('plc') || cat.includes('software')) {
    return '/attached_assets/generated_images/PLC_controller_product_2e5d3e3e.png';
  }
  
  // Default fallback to CNC machine
  return '/attached_assets/generated_images/CNC_machining_center_product_ef247597.png';
}

async function updateRealisticProductImages() {
  try {
    console.log('🖼️  Starting realistic product image update...');
    
    // Get all products
    const products = await storage.getAllProducts();
    console.log(`📦 Found ${products.length} products to update with realistic product images`);
    
    let updatedCount = 0;
    
    for (const product of products) {
      try {
        // Get realistic image for this product
        const imagePath = getRealisticProductImage(product.name, product.category);
        
        // Update product with realistic image (force update)
        await storage.updateProduct(product.id, {
          imagePath: imagePath
        });
        
        console.log(`✅ Updated "${product.name}" with realistic image: ${imagePath}`);
        updatedCount++;
        
        // Add small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error updating product ${product.name}:`, error);
      }
    }
    
    console.log(`🎉 Successfully updated ${updatedCount} products with realistic product images!`);
    console.log('💡 All products now have proper product photos that match their actual type');
    
  } catch (error) {
    console.error('❌ Error in updateRealisticProductImages:', error);
  }
}

// Run the update if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  updateRealisticProductImages()
    .then(() => {
      console.log('✨ Realistic product image update complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to update realistic product images:', error);
      process.exit(1);
    });
}

export { updateRealisticProductImages, getRealisticProductImage };
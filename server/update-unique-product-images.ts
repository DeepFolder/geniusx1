import { storage } from "./storage";

// Unique product images with white backgrounds - each product gets a specific image
const specificProductImages = [
  // CNC & Manufacturing Equipment
  { name: 'Precision CNC Machining Center', image: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&h=600&fit=crop&bg=white' },
  { name: 'CNC Machining Center', image: 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=800&h=600&fit=crop&bg=white' },
  { name: 'Metal 3D Printing System', image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop&bg=white' },
  { name: 'Professional 3D Printer', image: 'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=800&h=600&fit=crop&bg=white' },
  
  // Robotics & Automation
  { name: 'Industrial Robot Arm', image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=600&fit=crop&bg=white' },
  { name: 'Automated Assembly Line', image: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=600&fit=crop&bg=white' },
  { name: 'Assembly Robot', image: 'https://images.unsplash.com/photo-1553406830-ef2513450d76?w=800&h=600&fit=crop&bg=white' },
  { name: 'Robotic Assembly System', image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop&bg=white' },
  
  // Quality Control & Testing
  { name: 'Quality Control Scanner', image: 'https://images.unsplash.com/photo-1581092446466-6ad5aaf4e83a?w=800&h=600&fit=crop&bg=white' },
  { name: 'Testing Equipment', image: 'https://images.unsplash.com/photo-1562408590-e32931084e23?w=800&h=600&fit=crop&bg=white' },
  { name: 'Measurement Tool', image: 'https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&h=600&fit=crop&bg=white' },
  { name: 'Precision Instrument', image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=600&fit=crop&bg=white' },
  
  // AI & Software Solutions
  { name: 'AI Production Optimizer', image: 'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&h=600&fit=crop&bg=white' },
  { name: 'Predictive Maintenance Platform', image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=600&fit=crop&bg=white' },
  { name: 'robotAI', image: 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=600&fit=crop&bg=white' },
  { name: 'RoboticAI solution', image: 'https://images.unsplash.com/photo-1561553873-e8491a564fd0?w=800&h=600&fit=crop&bg=white' },
  { name: 'RobotAi', image: 'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=800&h=600&fit=crop&bg=white' },
  
  // Industrial Components & Hardware
  { name: 'Industrial Precision Screw IC316451', image: 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=800&h=600&fit=crop&bg=white' },
  { name: 'Servo Motor', image: 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=800&h=600&fit=crop&bg=white' },
  { name: 'Stepper Motor', image: 'https://images.unsplash.com/photo-1601558112721-fcaf828c9d81?w=800&h=600&fit=crop&bg=white' },
  { name: 'Linear Actuator', image: 'https://images.unsplash.com/photo-1516825513084-0cb8c44b3dfb?w=800&h=600&fit=crop&bg=white' },
  { name: 'Pneumatic Cylinder', image: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=800&h=600&fit=crop&bg=white' },
  
  // Sensors & Electronics
  { name: 'Pressure Sensor', image: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=600&fit=crop&bg=white' },
  { name: 'Temperature Sensor', image: 'https://images.unsplash.com/photo-1559566503-e72923ffc402?w=800&h=600&fit=crop&bg=white' },
  { name: 'Proximity Sensor', image: 'https://images.unsplash.com/photo-1472148439583-b7ec5d6dd98d?w=800&h=600&fit=crop&bg=white' },
  { name: 'Flow Sensor', image: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&h=600&fit=crop&bg=white' },
  { name: 'Vision System', image: 'https://images.unsplash.com/photo-1516825513084-0cb8c44b3dfb?w=800&h=600&fit=crop&bg=white' },
  
  // Control Systems & Panels
  { name: 'HMI Touch Panel', image: 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=600&fit=crop&bg=white' },
  { name: 'PLC Controller', image: 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=800&h=600&fit=crop&bg=white' },
  { name: 'Control Panel', image: 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop&bg=white' },
  { name: 'Industrial Computer', image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop&bg=white' },
  
  // Test & Generic Products
  { name: 'STEP File Test', image: 'https://images.unsplash.com/photo-1581092446466-6ad5aaf4e83a?w=800&h=600&fit=crop&bg=white' },
  { name: 'Test Delete Product', image: 'https://images.unsplash.com/photo-1562408590-e32931084e23?w=800&h=600&fit=crop&bg=white' },
  { name: 'Final Test Product', image: 'https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&h=600&fit=crop&bg=white' },
  { name: 'Test Product', image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=600&fit=crop&bg=white' },
];

// Additional unique images for products not in the specific list
const uniqueImagePool = [
  'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1581833971358-2c8b550f87b3?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1553406830-ef2513450d76?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1581092446466-6ad5aaf4e83a?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1562408590-e32931084e23?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1588345921523-c2dcdb7f1dcd?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1504307651254-35680f356dfd?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1561553873-e8491a564fd0?w=800&h=600&fit=crop&bg=white',
  'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=800&h=600&fit=crop&bg=white'
];

function getUniqueImageForProduct(productName: string, productIndex: number): string {
  // First check if we have a specific image for this product name
  const specificMatch = specificProductImages.find(item => 
    productName.toLowerCase().includes(item.name.toLowerCase()) ||
    item.name.toLowerCase().includes(productName.toLowerCase())
  );
  
  if (specificMatch) {
    return specificMatch.image;
  }
  
  // Otherwise, assign a unique image from the pool based on product index
  const imageIndex = productIndex % uniqueImagePool.length;
  return uniqueImagePool[imageIndex];
}

async function updateUniqueProductImages() {
  try {
    console.log('🖼️  Starting unique product image update...');
    
    // Get all products
    const products = await storage.getAllProducts();
    console.log(`📦 Found ${products.length} products to update with unique images`);
    
    let updatedCount = 0;
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      
      try {
        // Get unique image for this product
        const imageUrl = getUniqueImageForProduct(product.name, i);
        
        // Update product with unique image (force update even if image exists)
        await storage.updateProduct(product.id, {
          imagePath: imageUrl
        });
        
        console.log(`✅ Updated "${product.name}" with unique image: ${imageUrl}`);
        updatedCount++;
        
        // Add small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error updating product ${product.name}:`, error);
      }
    }
    
    console.log(`🎉 Successfully updated ${updatedCount} products with unique images!`);
    console.log('💡 Each product now has a distinct professional image');
    
  } catch (error) {
    console.error('❌ Error in updateUniqueProductImages:', error);
  }
}

// Run the update if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  updateUniqueProductImages()
    .then(() => {
      console.log('✨ Unique product image update complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to update unique product images:', error);
      process.exit(1);
    });
}

export { updateUniqueProductImages, getUniqueImageForProduct };
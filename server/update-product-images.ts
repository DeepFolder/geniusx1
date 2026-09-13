import { storage } from "./storage";

// Professional product images with white backgrounds
const productImageMappings = {
  // Manufacturing & CNC Equipment
  'precision cnc machining center': 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&bg=white',
  'cnc machining center': 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&bg=white',
  'cnc machine': 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&bg=white',
  'machining center': 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&bg=white',
  
  // Robotics & Automation
  'industrial robot': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=400&fit=crop&bg=white',
  'robotic arm': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=400&fit=crop&bg=white',
  'automated assembly line': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  'assembly robot': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=400&fit=crop&bg=white',
  'automation system': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  
  // Sensors & Electronics
  'pressure sensor': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  'temperature sensor': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&h=400&fit=crop&bg=white',
  'proximity sensor': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&h=400&fit=crop&bg=white',
  'flow sensor': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&h=400&fit=crop&bg=white',
  'iot sensor': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&h=400&fit=crop&bg=white',
  
  // Actuators & Motors
  'servo motor': 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=600&h=400&fit=crop&bg=white',
  'stepper motor': 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=600&h=400&fit=crop&bg=white',
  'linear actuator': 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=600&h=400&fit=crop&bg=white',
  'pneumatic actuator': 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=600&h=400&fit=crop&bg=white',
  'electric motor': 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=600&h=400&fit=crop&bg=white',
  
  // Pumps & Fluid Systems
  'centrifugal pump': 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&bg=white',
  'hydraulic pump': 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&bg=white',
  'vacuum pump': 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&bg=white',
  'water pump': 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&bg=white',
  'pump system': 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?w=600&h=400&fit=crop&bg=white',
  
  // Valves & Controls
  'ball valve': 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=600&h=400&fit=crop&bg=white',
  'control valve': 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=600&h=400&fit=crop&bg=white',
  'solenoid valve': 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=600&h=400&fit=crop&bg=white',
  'butterfly valve': 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=600&h=400&fit=crop&bg=white',
  'gate valve': 'https://images.unsplash.com/photo-1581092580497-e0d23cbdf1dc?w=600&h=400&fit=crop&bg=white',
  
  // Electronics & Displays
  'hmi panel': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  'touch screen': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  'control panel': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  'plc controller': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  'industrial computer': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  
  // Bearings & Mechanical
  'ball bearing': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  'roller bearing': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  'linear bearing': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  'thrust bearing': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  'bearing assembly': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  
  // Gears & Power Transmission
  'gear motor': 'https://images.unsplash.com/photo-1581092795360-fd1ca04f0952?w=600&h=400&fit=crop&bg=white',
  'worm gear': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  'planetary gear': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  'gearbox': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  'coupling': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white',
  
  // Tools & Instruments
  'measurement tool': 'https://images.unsplash.com/photo-1581092446466-6ad5aaf4e83a?w=600&h=400&fit=crop&bg=white',
  'calibration instrument': 'https://images.unsplash.com/photo-1581092446466-6ad5aaf4e83a?w=600&h=400&fit=crop&bg=white',
  'testing equipment': 'https://images.unsplash.com/photo-1581092446466-6ad5aaf4e83a?w=600&h=400&fit=crop&bg=white',
  'precision instrument': 'https://images.unsplash.com/photo-1581092446466-6ad5aaf4e83a?w=600&h=400&fit=crop&bg=white',
  'quality control tool': 'https://images.unsplash.com/photo-1581092446466-6ad5aaf4e83a?w=600&h=400&fit=crop&bg=white',
  
  // Default categories
  'manufacturing': 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&bg=white',
  'industrial': 'https://images.unsplash.com/photo-1518709268805-4e9042af2176?w=600&h=400&fit=crop&bg=white',
  'automation': 'https://images.unsplash.com/photo-1485827404703-89b55fcc595e?w=600&h=400&fit=crop&bg=white',
  'electronics': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=600&h=400&fit=crop&bg=white',
  'mechanical': 'https://images.unsplash.com/photo-1581092162384-8987c1d64718?w=600&h=400&fit=crop&bg=white'
};

function getProductImage(productName: string, category: string): string {
  const name = productName.toLowerCase();
  const cat = category.toLowerCase();
  
  // First, try to match specific product name
  for (const [key, imageUrl] of Object.entries(productImageMappings)) {
    if (name.includes(key)) {
      return imageUrl;
    }
  }
  
  // Then try to match by category
  for (const [key, imageUrl] of Object.entries(productImageMappings)) {
    if (cat.includes(key)) {
      return imageUrl;
    }
  }
  
  // Default fallback image
  return 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&h=400&fit=crop&bg=white';
}

async function updateAllProductImages() {
  try {
    console.log('🖼️  Starting product image update...');
    
    // Get all products
    const products = await storage.getAllProducts();
    console.log(`📦 Found ${products.length} products to update`);
    
    let updatedCount = 0;
    
    for (const product of products) {
      try {
        // Skip if product already has an image
        if (product.imagePath && product.imagePath !== '') {
          console.log(`⏭️  Skipping ${product.name} - already has image`);
          continue;
        }
        
        // Get appropriate image for this product
        const imageUrl = getProductImage(product.name, product.category);
        
        // Update product with image
        await storage.updateProduct(product.id, {
          imagePath: imageUrl
        });
        
        console.log(`✅ Updated ${product.name} with image: ${imageUrl}`);
        updatedCount++;
        
        // Add small delay to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ Error updating product ${product.name}:`, error);
      }
    }
    
    console.log(`🎉 Successfully updated ${updatedCount} products with images!`);
    console.log('💡 All products now have professional white-background images');
    
  } catch (error) {
    console.error('❌ Error in updateAllProductImages:', error);
  }
}

// Run the update if this file is executed directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  updateAllProductImages()
    .then(() => {
      console.log('✨ Product image update complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Failed to update product images:', error);
      process.exit(1);
    });
}

export { updateAllProductImages, getProductImage };
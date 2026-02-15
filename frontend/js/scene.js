class SceneManager{
constructor(){
this.scene=null;
this.camera=null;
this.renderer=null;
this.canvas=null;
this.projectionScale=1;
}


init(){
    this.canvas=document.getElementById("main-canvas");

    this.scene=new THREE.Scene();

    const w=this.canvas.clientWidth||window.innerWidth;
    const h=this.canvas.clientHeight||window.innerHeight;
    const aspect=w/h;

    // real webcam perspective
    const FOV=60;
    this.camera=new THREE.PerspectiveCamera(FOV,aspect,0.01,100);
    this.camera.position.set(0,0,0);
    this.camera.lookAt(0,0,-1);

    // projection scale for mapper
    this.projectionScale=2*Math.tan((FOV*Math.PI/180)/2);

    this.renderer=new THREE.WebGLRenderer({
        canvas:this.canvas,
        alpha:true,
        antialias:true
    });

    this.renderer.setSize(w,h);
    this.renderer.setClearColor(0x000000,0);

    this.addLights();
    console.log("Scene ready");
}

addLights(){
    this.scene.add(new THREE.AmbientLight(0xffffff,0.5));

    const d=new THREE.DirectionalLight(0xffffff,0.6);
    d.position.set(2,3,2);
    this.scene.add(d);
}

updateCamera(videoW,videoH){
    this.renderer.setSize(videoW,videoH,false);
    this.camera.aspect=videoW/videoH;
    this.camera.updateProjectionMatrix();
}

render(){
    this.renderer.render(this.scene,this.camera);
}

getProjectionScale(){
    return this.projectionScale;
}


}

const sceneManager=new SceneManager();
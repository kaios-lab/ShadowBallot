import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedShadowBallot = await deploy("ShadowBallot", {
    from: deployer,
    log: true,
  });

  console.log(`ShadowBallot contract: `, deployedShadowBallot.address);
};
export default func;
func.id = "deploy_shadow_ballot"; // id required to prevent reexecution
func.tags = ["ShadowBallot"];
